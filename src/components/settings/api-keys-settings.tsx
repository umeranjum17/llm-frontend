"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { Plus, Trash2, Eye, EyeOff, Check, CheckCircle2, XCircle, Shield, Lock, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CUSTOM_OPENAI_PREFIX, getProviderConfig, isCustomOpenAIProvider } from "@/lib/providers";
import { ApiKeySyncSettings } from "./api-key-sync-settings";

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
  const { keys, addKey, removeKey } = useApiKeysStore();
  const [newProvider, setNewProvider] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);

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
  };

  const handleRemoveKey = async (id: string) => {
    await removeKey(id);
    toast.success("API key removed");
  };

  const handleTestKey = async (id: string) => {
    setTestingKey(id);
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
        const msg = typeof payload?.error === "string" ? payload.error : "Failed to validate key";
        throw new Error(msg);
      }

      toast.success("Provider connection looks good");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to validate key");
    } finally {
      setTestingKey(null);
    }
  };

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  };

  const isCustomOpenAI = newProvider === "custom-openai";
  const selectedProvider = PROVIDERS.find((p) => p.id === newProvider);
  const baseUrlHint = (selectedProvider as any)?.baseUrl as string | undefined;
  const apiKeyOptional = !!(selectedProvider as any)?.apiKeyOptional;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">API Keys</h3>
        <p className="text-sm text-muted-foreground">
          Manage your API keys for different LLM providers
        </p>
      </div>

      {/* API Key Sync Settings */}
      <ApiKeySyncSettings />

      {/* Existing Keys */}
      {keys.length > 0 && (
        <div className="space-y-3">
          <Label>Your API Keys</Label>
          {keys.map((apiKey) => {
            const providerConfig = getProviderConfig(apiKey.provider);
            const isComposio = apiKey.provider === "composio";
            const providerName =
              providerConfig?.name ||
              (isCustomOpenAIProvider(apiKey.provider) ? (apiKey.label || "Custom (OpenAI-compatible)") : apiKey.provider);
            return (
              <div
                key={apiKey.id}
                className={`flex items-center gap-3 p-4 border rounded-lg ${
                  isComposio ? "border-purple-500/30 bg-purple-500/5" : ""
                }`}
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
                    {apiKey.label && !isComposio && (
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
                  <code className="text-xs text-muted-foreground font-mono">
                    {showKeys[apiKey.id]
                      ? apiKey.key
                      : maskKey(apiKey.key)}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleShowKey(apiKey.id)}
                    title={showKeys[apiKey.id] ? "Hide key" : "Show key"}
                  >
                    {showKeys[apiKey.id] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTestKey(apiKey.id)}
                    disabled={testingKey === apiKey.id}
                    title="Test key"
                  >
                    {testingKey === apiKey.id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
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

          <Button onClick={handleAddKey} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add API Key
          </Button>
        </div>
      </div>

      {/* Help Text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          • Your API keys are stored locally in your browser and never sent to
          our servers
        </p>
        <p>
          • Keys are used only to make requests directly to the LLM providers
        </p>
        <p>
          • We recommend using API keys with spending limits for safety
        </p>
      </div>
    </div>
  );
}
