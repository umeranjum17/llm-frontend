"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { Plus, Trash2, Eye, EyeOff, Check, X, Activity, Lock, Unlock, Fingerprint, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CUSTOM_OPENAI_PREFIX, getProviderConfig, isCustomOpenAIProvider } from "@/lib/providers";
import { isPasskeySupported } from "@/lib/crypto/vault-passkey";
import { validatePassphraseStrength, type PassphraseStrength } from "@/lib/crypto/passphrase-validator";
import { ApiKeyTransferDialog, ApiKeyImportDialog } from "./api-key-transfer";
import { SYNC_S3_PROVIDER } from "@/stores/api-keys-store";

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/keys" },
  { id: "openai", name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", url: "https://console.anthropic.com/settings/keys" },
  { id: "google", name: "Google AI", url: "https://aistudio.google.com/app/apikey" },
  { id: "groq", name: "Groq (OpenAI-compatible)", url: "https://console.groq.com/keys", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "together", name: "Together AI (OpenAI-compatible)", url: "https://api.together.xyz/settings/api-keys", baseUrl: "https://api.together.xyz/v1" },
  { id: "deepseek", name: "DeepSeek", url: "https://platform.deepseek.com/api_keys", baseUrl: "https://api.deepseek.com" },
  { id: "mistral", name: "Mistral AI", url: "https://console.mistral.ai/api-keys/", baseUrl: "https://api.mistral.ai/v1" },
  { id: "xai", name: "xAI (Grok)", url: "https://console.x.ai/", baseUrl: "https://api.x.ai/v1" },
  { id: "perplexity", name: "Perplexity (OpenAI-compatible)", url: "https://www.perplexity.ai/settings/api", baseUrl: "https://api.perplexity.ai" },
  { id: "anyscale", name: "Anyscale (OpenAI-compatible)", url: "https://app.endpoints.anyscale.com/credentials", baseUrl: "https://api.endpoints.anyscale.com/v1" },
  { id: "custom-openai", name: "Custom (OpenAI-compatible)", url: "https://platform.openai.com/docs/api-reference", needsBaseUrl: true },
  { id: "composio", name: "Composio (Tool Router)", url: "https://platform.composio.dev" },
] as const;

// Composio is now stored in the encrypted api-keys store like other providers

export function ApiKeysSettings() {
  const {
    keys,
    addKey,
    removeKey,
    vault,
    lockedKeyIds,
    unlockVault,
    unlockVaultWithPasskey,
    lockVault,
    enableVault,
    disableVault,
    setVaultRememberMs,
    setupVaultPasskey,
    removeVaultPasskey,
  } = useApiKeysStore();
  const [newProvider, setNewProvider] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultPassphraseConfirm, setVaultPassphraseConfirm] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [showRecoveryWarning, setShowRecoveryWarning] = useState(false);
  const [rememberMs, setRememberMs] = useState<number>(vault.rememberMs);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [showVaultPrompt, setShowVaultPrompt] = useState(false);
  const [promptPassphrase, setPromptPassphrase] = useState("");
  const [promptConfirm, setPromptConfirm] = useState("");
  const [isPromptBusy, setIsPromptBusy] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const rememberOptions: Array<{ label: string; value: number; description: string }> = [
    { label: "1 hour", value: 60 * 60 * 1000, description: "Auto-locks in 1 hour" },
    { label: "24 hours", value: 24 * 60 * 60 * 1000, description: "Auto-locks in 24 hours" },
    { label: "7 days", value: 7 * 24 * 60 * 60 * 1000, description: "Auto-locks in 7 days" },
  ];

  useEffect(() => {
    setRememberMs(vault.rememberMs);
  }, [vault.rememberMs]);

  useEffect(() => {
    setPasskeySupported(isPasskeySupported());
  }, []);

  const handleAddKey = async () => {
    if (!newProvider) {
      toast.error("Please select a provider");
      return;
    }

    const selected = PROVIDERS.find((p) => p.id === newProvider);
    const isCustomOpenAI = newProvider === "custom-openai";
    const needsBaseUrl = isCustomOpenAI;

    if (!newKey) {
      toast.error("Please enter an API key");
      return;
    }

    if (needsBaseUrl && !newBaseUrl) {
      toast.error("Please enter a base URL");
      return;
    }

    try {
      if (isCustomOpenAI) {
        const providerId = `${CUSTOM_OPENAI_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
        const label = (newLabel || newBaseUrl.replace(/^https?:\/\//, "").split("/")[0] || "Custom").trim();
        await addKey(providerId, newKey, label, newBaseUrl);
      } else {
        const baseUrl = (selected as any)?.baseUrl || undefined;
        await addKey(newProvider, newKey, newLabel || undefined, baseUrl);
      }

      toast.success("API key added successfully");
      setNewProvider("");
      setNewKey("");
      setNewLabel("");
      setNewBaseUrl("");

      if (!vault.meta && !localStorage.getItem("vaultPromptDismissed")) {
        setShowVaultPrompt(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add API key");
    }
  };

  const handleRemoveKey = async (id: string) => {
    await removeKey(id);
    toast.success("API key removed");
  };

  const handleTestKey = async (id: string) => {
    setTestingKey(id);
    // Clear any previous result for this key
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const key = keys.find((k) => k.id === id);
      if (!key) throw new Error("Key not found");

      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: key.provider,
          apiKey: key.key,
          baseUrl: key.baseUrl,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof payload?.suggestion === "string"
          ? payload.suggestion
          : typeof payload?.error === "string"
            ? payload.error
            : "Failed to validate key";
        throw new Error(msg);
      }

      setTestResults((prev) => ({ ...prev, [id]: { ok: true, message: "Connected" } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to validate key";
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, message } }));
    } finally {
      setTestingKey(null);
      // Auto-clear result after 5 seconds
      setTimeout(() => {
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 5000);
    }
  };

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  };

  const formatDuration = (ms: number) => {
    if (ms % (24 * 60 * 60 * 1000) === 0) {
      const days = ms / (24 * 60 * 60 * 1000);
      return days === 1 ? "24h" : `${days}d`;
    }
    if (ms % (60 * 60 * 1000) === 0) {
      const hours = ms / (60 * 60 * 1000);
      return hours === 1 ? "1h" : `${hours}h`;
    }
    const minutes = Math.round(ms / (60 * 1000));
    return `${minutes}m`;
  };

  const handleVaultRememberChange = async (value: string) => {
    const ms = Number(value);
    setRememberMs(ms);
    try {
      await setVaultRememberMs(ms);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update remember duration");
    }
  };

  const passphraseStrength = useMemo<PassphraseStrength | null>(() => {
    if (!vaultPassphrase) return null;
    return validatePassphraseStrength(vaultPassphrase);
  }, [vaultPassphrase]);

  const handleEnableVault = async () => {
    if (!vaultPassphrase) {
      toast.error("Enter a passphrase");
      return;
    }
    if (vaultPassphrase.length < 8) {
      toast.error("Passphrase must be at least 8 characters");
      return;
    }
    if (vaultPassphrase !== vaultPassphraseConfirm) {
      toast.error("Passphrases do not match");
      return;
    }

    setShowRecoveryWarning(true);
  };

  const confirmEnableVault = async () => {
    setShowRecoveryWarning(false);
    setVaultBusy(true);
    try {
      await enableVault(vaultPassphrase, rememberMs);
      setVaultPassphrase("");
      setVaultPassphraseConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable vault");
    } finally {
      setVaultBusy(false);
    }
  };

  const handlePromptEnable = async () => {
    if (!promptPassphrase) {
      toast.error("Enter a passphrase");
      return;
    }
    if (promptPassphrase.length < 8) {
      toast.error("Passphrase must be at least 8 characters");
      return;
    }
    if (promptPassphrase !== promptConfirm) {
      toast.error("Passphrases do not match");
      return;
    }

    setIsPromptBusy(true);
    try {
      await enableVault(promptPassphrase, rememberMs);
      setPromptPassphrase("");
      setPromptConfirm("");
      setShowVaultPrompt(false);
      localStorage.setItem("vaultPromptDismissed", "true");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable vault");
    } finally {
      setIsPromptBusy(false);
    }
  };

  const handleUnlockVault = async () => {
    if (!vaultPassphrase) {
      toast.error("Enter your passphrase");
      return;
    }

    setVaultBusy(true);
    try {
      await unlockVault(vaultPassphrase, rememberMs);
      setVaultPassphrase("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to unlock vault";
      const title = message.toLowerCase().includes("passphrase") ? "Incorrect passphrase" : "Unlock failed";
      toast.error(title, { description: message });
    } finally {
      setVaultBusy(false);
    }
  };

  const handleUnlockWithPasskey = async () => {
    setVaultBusy(true);
    try {
      await unlockVaultWithPasskey(rememberMs);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to unlock vault with passkey";
      const title = message.toLowerCase().includes("passkey") ? "Passkey failed" : "Unlock failed";
      toast.error(title, { description: message });
    } finally {
      setVaultBusy(false);
    }
  };

  const handleDisableVault = async () => {
    if (!vaultPassphrase) {
      toast.error("Enter your passphrase to disable the vault");
      return;
    }

    setVaultBusy(true);
    try {
      await disableVault(vaultPassphrase);
      setVaultPassphrase("");
      setVaultPassphraseConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disable vault");
    } finally {
      setVaultBusy(false);
    }
  };

  const handleSetupPasskey = async () => {
    setVaultBusy(true);
    try {
      await setupVaultPasskey(vaultPassphrase || undefined);
      setVaultPassphrase("");
      toast.success("Passkey enabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set up passkey");
    } finally {
      setVaultBusy(false);
    }
  };

  const handleRemovePasskey = async () => {
    setVaultBusy(true);
    try {
      await removeVaultPasskey();
      toast.success("Passkey removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove passkey");
    } finally {
      setVaultBusy(false);
    }
  };

  const isCustomOpenAI = newProvider === "custom-openai";
  const selectedProvider = PROVIDERS.find((p) => p.id === newProvider);
  const baseUrlHint = (selectedProvider as any)?.baseUrl as string | undefined;
  const apiKeyOptional = !!(selectedProvider as any)?.apiKeyOptional;
  const hasPasskey = !!vault.passkey;
  const passphraseAutoComplete = vault.meta ? "current-password" : "new-password";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">API Keys</h3>
        <p className="text-sm text-muted-foreground">
          Manage your API keys for different LLM providers
        </p>
      </div>

      {/* Vault advanced settings */}
      <details className="mt-12 border-t pt-6">
        <summary className="text-sm text-muted-foreground cursor-pointer">Security settings</summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">Passphrase Vault</h4>
                  {vault.meta ? (
                    <Badge variant="secondary" className="text-xs">
                      {vault.isUnlocked ? "Unlocked" : "Locked"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Off
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Encrypt API keys with a passphrase. We can remember the unlock on this device for the time you choose.
                </p>
              </div>
              {vault.meta && vault.isUnlocked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={lockVault}
                  disabled={vaultBusy}
                  className="shrink-0"
                  title="Lock vault now"
                >
                  <Lock className="h-3.5 w-3.5 mr-2" />
                  Lock
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">Auto-lock after</Label>
                <Select value={String(rememberMs)} onValueChange={handleVaultRememberChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rememberOptions.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-[11px] text-muted-foreground">{opt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vault.meta && vault.isUnlocked && vault.unlockedUntil && (
                  <p className="text-[11px] text-muted-foreground">
                    Unlocked for {formatDuration(rememberMs)} (locks automatically)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{vault.meta ? "Passphrase" : "New passphrase"}</Label>
                <Input
                  type="password"
                  value={vaultPassphrase}
                  onChange={(e) => setVaultPassphrase(e.target.value)}
                  placeholder="Passphrase (12+ chars recommended)"
                  autoComplete={passphraseAutoComplete}
                  name="vault-passphrase"
                  disabled={vaultBusy}
                />
                {!vault.meta && passphraseStrength && vaultPassphrase.length >= 8 && (
                  <p className="text-[11px] text-muted-foreground">
                    {vaultPassphrase.length < 12 ? "12+ characters recommended" : "Looks good"}
                  </p>
                )}
              </div>

              {!vault.meta && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Confirm passphrase</Label>
                  <Input
                    type="password"
                    value={vaultPassphraseConfirm}
                    onChange={(e) => setVaultPassphraseConfirm(e.target.value)}
                    placeholder="Confirm passphrase"
                    autoComplete="new-password"
                    name="vault-passphrase-confirm"
                    disabled={vaultBusy}
                  />
                </div>
              )}
            </div>

            {vault.meta && passkeySupported && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Fingerprint className="h-3.5 w-3.5" />
                  <span>{hasPasskey ? "Passkey enabled" : "Passkey not set up"}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!hasPasskey && vault.isUnlocked && (
                    <Button variant="outline" size="sm" onClick={handleSetupPasskey} disabled={vaultBusy}>
                      Set up passkey
                    </Button>
                  )}
                  {hasPasskey && vault.isUnlocked && (
                    <Button variant="outline" size="sm" onClick={handleRemovePasskey} disabled={vaultBusy}>
                      Remove passkey
                    </Button>
                  )}
                  {hasPasskey && !vault.isUnlocked && (
                    <Button size="sm" onClick={handleUnlockWithPasskey} disabled={vaultBusy}>
                      Unlock with passkey
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
              {!vault.meta ? (
                <Button onClick={handleEnableVault} disabled={vaultBusy} className="sm:w-auto">
                  <Unlock className="h-4 w-4 mr-2" />
                  Enable Vault
                </Button>
              ) : vault.isUnlocked ? (
                <Button variant="destructive" onClick={handleDisableVault} disabled={vaultBusy} className="sm:w-auto">
                  Disable Vault
                </Button>
              ) : (
                <div className="flex gap-2 sm:ml-auto">
                  <Button onClick={handleUnlockVault} disabled={vaultBusy} className="flex-1 sm:flex-none">
                    <Unlock className="h-4 w-4 mr-2" />
                    Unlock
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDisableVault}
                    disabled={vaultBusy}
                    className="flex-1 sm:flex-none"
                    title="Disable vault (requires passphrase)"
                  >
                    Disable
                  </Button>
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              If you forget your passphrase, protected keys can&apos;t be recovered — you&apos;ll need to re-enter them.
            </p>
          </div>
        </div>
      </details>

      <Dialog open={showRecoveryWarning} onOpenChange={setShowRecoveryWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-destructive" />
              No passphrase recovery
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              If you forget your passphrase, the vault cannot be recovered and you will need to re-enter all API keys.
            </p>
            <p>Store your passphrase in a password manager.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecoveryWarning(false)}>
              Cancel
            </Button>
            <Button onClick={confirmEnableVault}>I understand, enable vault</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVaultPrompt} onOpenChange={setShowVaultPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Protect your API key?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add a passphrase to encrypt your keys locally.
          </p>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Passphrase (12+ chars recommended)"
              value={promptPassphrase}
              onChange={(e) => setPromptPassphrase(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirm"
              value={promptConfirm}
              onChange={(e) => setPromptConfirm(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col gap-2">
            <Button onClick={handlePromptEnable} disabled={isPromptBusy}>
              Protect &amp; Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowVaultPrompt(false);
                localStorage.setItem("vaultPromptDismissed", "true");
              }}
            >
              Skip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Existing Keys */}
      {keys.length > 0 && (
        <div className="space-y-3">
          <Label>Your API Keys</Label>
          {keys.map((apiKey) => {
            const providerConfig = getProviderConfig(apiKey.provider);
            const isComposio = apiKey.provider === "composio";
            const isS3 = apiKey.provider === SYNC_S3_PROVIDER;
            const isLocked = lockedKeyIds.includes(apiKey.id);

            // Parse S3 config for display
            let s3Info: { bucket?: string; endpoint?: string } | null = null;
            if (isS3 && !isLocked) {
              try {
                s3Info = JSON.parse(apiKey.key);
              } catch {
                // Invalid JSON, show as regular key
              }
            }

            const providerName = isS3
              ? "S3 Sync"
              : providerConfig?.name ||
                (isCustomOpenAIProvider(apiKey.provider) ? (apiKey.label || "Custom (OpenAI-compatible)") : apiKey.provider);

            const borderClass = isComposio
              ? "border-purple-500/30 bg-purple-500/5"
              : isS3
                ? "border-green-500/30 bg-green-500/5"
                : "";

            return (
              <div
                key={apiKey.id}
                className={`flex items-center gap-3 p-4 border rounded-lg ${borderClass}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">
                      {providerName}
                    </span>
                    {isComposio && (
                      <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-400">
                        <Activity className="h-3 w-3 mr-1" />
                        Tools
                      </Badge>
                    )}
                    {isS3 && (
                      <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400">
                        Sync
                      </Badge>
                    )}
                    {apiKey.label && !isComposio && !isS3 && (
                      <Badge variant="secondary" className="text-xs">
                        {apiKey.label}
                      </Badge>
                    )}
                  </div>
                  {apiKey.baseUrl && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {apiKey.baseUrl}
                    </div>
                  )}
                  {isS3 && s3Info ? (
                    <div className="text-xs text-muted-foreground font-mono">
                      {isLocked ? (
                        <span>Locked</span>
                      ) : (
                        <span>{s3Info.bucket} @ {s3Info.endpoint || "s3.amazonaws.com"}</span>
                      )}
                    </div>
                  ) : (
                    <code className="text-xs text-muted-foreground font-mono">
                      {isLocked ? (
                        <span className="text-muted-foreground">Locked</span>
                      ) : showKeys[apiKey.id] ? (
                        apiKey.key
                      ) : (
                        maskKey(apiKey.key)
                      )}
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isS3 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleShowKey(apiKey.id)}
                      disabled={isLocked}
                      title={showKeys[apiKey.id] ? "Hide key" : "Show key"}
                    >
                      {showKeys[apiKey.id] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {!isS3 && (
                    <>
                      {testResults[apiKey.id] && (
                        <span className={`flex items-center gap-1 text-xs whitespace-nowrap ${testResults[apiKey.id].ok ? "text-green-500" : "text-red-500"}`}>
                          {testResults[apiKey.id].ok ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          <span className="max-w-[120px] truncate">{testResults[apiKey.id].message}</span>
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestKey(apiKey.id)}
                        disabled={isLocked || testingKey === apiKey.id}
                        title="Test API key connection"
                        className="h-8 px-2 text-xs"
                      >
                        {testingKey === apiKey.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        )}
                        Test
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveKey(apiKey.id)}
                    title="Remove key"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Key */}
      <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
        <h4 className="font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add New API Key
        </h4>
        {vault.meta && !vault.isUnlocked && (
          <p className="text-xs text-muted-foreground">
            Unlock the vault to add or reveal keys.
          </p>
        )}

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={newProvider} onValueChange={setNewProvider}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newProvider && (
              <p className="text-xs text-muted-foreground">
                Get your key from{" "}
                <a
                  href={PROVIDERS.find((p) => p.id === newProvider)?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  {PROVIDERS.find((p) => p.id === newProvider)?.url}
                </a>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">
              {apiKeyOptional ? "API Key (Optional)" : "API Key"}
            </Label>
            <Input
              id="api-key"
              type="password"
              placeholder={apiKeyOptional ? "(optional)" : "sk-..."}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>

          {(isCustomOpenAI || !!baseUrlHint) && (
            <div className="space-y-2">
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                type="text"
                placeholder={baseUrlHint || "https://provider.example.com/v1"}
                value={baseUrlHint ? baseUrlHint : newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
                disabled={!!baseUrlHint && !isCustomOpenAI}
              />
              <p className="text-xs text-muted-foreground">
                Use the provider&apos;s OpenAI-compatible base URL (include `/v1` if required).
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="label">Label (Optional)</Label>
            <Input
              id="label"
              placeholder="e.g., Personal, Work"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>

          <Button onClick={handleAddKey} className="w-full" disabled={!!vault.meta && !vault.isUnlocked}>
            <Plus className="h-4 w-4 mr-2" />
            Add API Key
          </Button>
        </div>
      </div>

      {/* Transfer to New Device */}
      <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium">Transfer to New Device</h4>
            <p className="text-sm text-muted-foreground">
              Move your API keys securely via QR code, link, or encrypted file
            </p>
          </div>
          <Button
            onClick={() => setShowTransferDialog(true)}
            disabled={keys.length === 0 || (!!vault.meta && !vault.isUnlocked)}
          >
            Start Transfer
          </Button>
        </div>
        {keys.length === 0 && (
          <p className="text-xs text-muted-foreground">Add API keys first to enable transfer.</p>
        )}
        {vault.meta && !vault.isUnlocked && keys.length > 0 && (
          <p className="text-xs text-muted-foreground">Unlock the vault to transfer keys.</p>
        )}
        <div className="border-t pt-3 mt-3">
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            disabled={!!vault.meta && !vault.isUnlocked}
            className="w-full"
          >
            Import from File
          </Button>
        </div>
      </div>

      <ApiKeyTransferDialog open={showTransferDialog} onOpenChange={setShowTransferDialog} />
      <ApiKeyImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />

      {/* Help Text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          • API keys are stored locally and excluded from cloud sync
        </p>
        <p>
          • Keys are used only to make requests to the LLM providers
        </p>
        <p>
          • We recommend using API keys with spending limits for safety
        </p>
      </div>
    </div>
  );
}
