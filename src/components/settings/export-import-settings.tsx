"use client";

import { useState, useRef, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download,
  Upload,
  AlertTriangle,
  FileJson,
  FileText,
  Trash2,
  Shield,
  Key,
  Server,
  Bot,
  MessageSquare,
  Star,
  Tag,
  Settings,
  Loader2,
  CheckCircle2,
  Lock,
  Clock,
  Link2,
  Copy,
  Check,
  Database,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { db, DB_SCHEMA_VERSION } from "@/lib/db/schema";
import { deleteAllChats } from "@/lib/db/queries";
import { checkMigration, forceMigration } from "@/lib/db/migration";
import {
  exportAllSettings,
  downloadSettingsFile,
  getExportSummary,
  ExportSettingsError,
} from "@/lib/db/export-settings";
import {
  importSettings,
  validateSettingsExport,
  readFileAsText,
  getImportPreview,
  type ImportMode,
} from "@/lib/db/import-settings";
import {
  encryptSettings,
  decryptSettings,
  isValidEncryptedFormat,
  checkExpiration,
  getExpirationTimestamp,
  getShareLinkExpirationTimestamp,
  createShareableUrl,
  type ExpirationOption,
  type ShareLinkExpirationOption,
} from "@/lib/crypto/settings-crypto";

// Secure Export Dialog
function SecureExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [expiration, setExpiration] = useState<ExpirationOption>("7d");
  const [isExporting, setIsExporting] = useState(false);
  const [includeApiKeys, setIncludeApiKeys] = useState(true);
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof getExportSummary>
  > | null>(null);

  const loadSummary = async () => {
    const data = await getExportSummary();
    setSummary(data);
    setIncludeApiKeys(data.apiKeys > 0);
  };

  const handleExport = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (includeApiKeys && expiration === "never") {
      toast.error("API key exports must have an expiration");
      return;
    }

    setIsExporting(true);
    try {
      const settings = await exportAllSettings({ includeApiKeys });
      const expiresAt = getExpirationTimestamp(expiration);
      const encrypted = await encryptSettings(settings, password, expiresAt);
      downloadSettingsFile(encrypted);
      toast.success("Settings exported securely");
      onOpenChange(false);
      setPassword("");
      setConfirmPassword("");
      setExpiration("7d");
      setIncludeApiKeys(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export settings";
      const isVaultLocked =
        error instanceof ExportSettingsError && error.code === "VAULT_LOCKED";
      toast.error("Failed to export settings", {
        description: message,
        action: isVaultLocked
          ? {
              label: "API Keys",
              onClick: () => {
                window.location.href = "/settings?tab=api-keys";
              },
            }
          : undefined,
      });
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) loadSummary();
        else {
          setPassword("");
          setConfirmPassword("");
          setIncludeApiKeys(false);
        }
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Secure Export
          </DialogTitle>
          <DialogDescription>
            Export settings with password protection. You can include API keys for
            device transfer (choose an expiration).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {summary && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
              <div className="font-medium mb-2">Will export:</div>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                {summary.apiKeys > 0 && (
                  <div className="flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    {summary.apiKeys} API keys {includeApiKeys ? "" : "(excluded)"}
                  </div>
                )}
                {summary.mcpServers > 0 && (
                  <div className="flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    {summary.mcpServers} MCP servers
                  </div>
                )}
                {summary.agents > 0 && (
                  <div className="flex items-center gap-1">
                    <Bot className="h-3 w-3" />
                    {summary.agents} agents
                  </div>
                )}
                {summary.prompts > 0 && (
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {summary.prompts} prompts
                  </div>
                )}
                {summary.modelFavorites > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    {summary.modelFavorites} favorites
                  </div>
                )}
                {summary.tags > 0 && (
                  <div className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {summary.tags} tags
                  </div>
                )}
                {summary.hasSettings && (
                  <div className="flex items-center gap-1">
                    <Settings className="h-3 w-3" />
                    User settings
                  </div>
                )}
              </div>
            </div>
          )}

          {summary?.apiKeys !== undefined && (
            <div className="space-y-2">
              <Label>Include</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={includeApiKeys}
                  onCheckedChange={(c) => {
                    const next = !!c;
                    setIncludeApiKeys(next);
                    if (next && expiration === "never") {
                      setExpiration("7d");
                    }
                  }}
                  disabled={summary.apiKeys === 0}
                />
                <Key className="h-3 w-3" />
                API keys {summary.apiKeys > 0 ? `(${summary.apiKeys})` : ""}
              </label>
              <p className="text-xs text-muted-foreground">
                Only enable if you intentionally want to transfer keys to another device.
              </p>
            </div>
          )}

          {includeApiKeys && (
            <div className="flex items-start gap-2 p-3 border rounded-md bg-yellow-500/10 border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600 shrink-0" />
              <p className="text-xs text-muted-foreground">
                This export will contain API keys (encrypted). Use a short expiration and delete the file after you import it.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="export-password">Encryption Password</Label>
            <Input
              id="export-password"
              type="password"
              placeholder="Enter a strong password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label>Backup Expiration</Label>
            <Select
              value={expiration}
              onValueChange={(v) => setExpiration(v as ExpirationOption)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">24 hours</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                {!includeApiKeys && (
                  <SelectItem value="never">Never expires</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {includeApiKeys
                ? "API key exports must expire. Expired backups cannot be imported, even with the correct password."
                : "Expired backups cannot be imported, even with the correct password"}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || password.length < 8}
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Encrypting...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Export Encrypted
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Secure Import Dialog
function SecureImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ReturnType<
    typeof getImportPreview
  > | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importOptions, setImportOptions] = useState({
    importApiKeys: true,
    importMcpServers: true,
    importAgents: true,
    importPrompts: true,
    importSettings: true,
    importModelFavorites: true,
    importModelAliases: true,
    importParameterPresets: true,
    importTags: true,
    importTagRules: true,
  });
  const [step, setStep] = useState<"select" | "decrypt" | "configure">(
    "select"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setPassword("");
    setSelectedFile(null);
    setPreview(null);
    setStep("select");
    setImportMode("merge");
    setExpirationInfo(null);
  };

  const [expirationInfo, setExpirationInfo] = useState<{
    isExpired: boolean;
    expiresAt?: Date;
    hasExpiration: boolean;
  } | null>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check expiration before proceeding
    try {
      const content = await readFileAsText(file);
      if (!isValidEncryptedFormat(content)) {
        toast.error("Invalid file format. Please select a valid .lumina file.");
        return;
      }

      const expInfo = checkExpiration(content);
      setExpirationInfo(expInfo);

      if (expInfo.isExpired) {
        toast.error(
          `This backup expired on ${expInfo.expiresAt?.toLocaleDateString()}. Please create a new export.`
        );
        return;
      }

      setSelectedFile(file);
      setStep("decrypt");
    } catch (error) {
      toast.error("Failed to read file");
    }
  };

  const handleDecrypt = async () => {
    if (!selectedFile || !password) return;

    setIsImporting(true);
    try {
      const content = await readFileAsText(selectedFile);

      if (!isValidEncryptedFormat(content)) {
        toast.error("Invalid file format. Please select a valid .lumina file.");
        return;
      }

      const decrypted = await decryptSettings(content, password);

      if (!validateSettingsExport(decrypted)) {
        toast.error("Decrypted data is invalid or corrupted");
        return;
      }

      const previewData = getImportPreview(decrypted);
      setPreview(previewData);
      setImportOptions((prev) => ({
        ...prev,
        importApiKeys: previewData.apiKeys > 0 ? prev.importApiKeys : false,
      }));
      setStep("configure");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to decrypt file"
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !password) return;

    setIsImporting(true);
    try {
      // Re-decrypt right before import so plaintext API keys aren't kept in React state.
      const content = await readFileAsText(selectedFile);

      if (!isValidEncryptedFormat(content)) {
        toast.error("Invalid file format. Please select a valid .lumina file.");
        return;
      }

      const decrypted = await decryptSettings(content, password);
      if (!validateSettingsExport(decrypted)) {
        toast.error("Decrypted data is invalid or corrupted");
        return;
      }

      const result = await importSettings(decrypted, {
        mode: importMode,
        ...importOptions,
      });

      if (result.success) {
        const totalImported =
          result.imported.apiKeys +
          result.imported.mcpServers +
          result.imported.agents +
          result.imported.prompts +
          result.imported.modelFavorites +
          result.imported.tags +
          (result.imported.settings ? 1 : 0);

        toast.success(`Successfully imported ${totalImported} items`);
        onOpenChange(false);
        resetState();
        window.location.reload();
      } else {
        toast.error(`Import completed with ${result.errors.length} errors`);
        console.error("Import errors:", result.errors);
      }
    } catch (error) {
      toast.error("Failed to import settings");
      console.error(error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetState();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Secure Import
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Select an encrypted .lumina file."}
            {step === "decrypt" && "Enter the password to decrypt."}
            {step === "configure" && "Choose what to import."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === "select" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".lumina,.json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full h-20 border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm">Select .lumina file</span>
                </div>
              </Button>
            </>
          )}

          {step === "decrypt" && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {selectedFile?.name}
              </div>
              {expirationInfo?.hasExpiration && expirationInfo.expiresAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  <Clock className="h-3 w-3" />
                  Expires: {expirationInfo.expiresAt.toLocaleDateString()}{" "}
                  {expirationInfo.expiresAt.toLocaleTimeString()}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="import-password">Password</Label>
                <Input
                  id="import-password"
                  type="password"
                  placeholder="Enter decryption password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && password) handleDecrypt();
                  }}
                />
              </div>
            </>
          )}

          {step === "configure" && preview && (
            <>
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="font-medium mb-2">File contains:</div>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                  {preview.apiKeys > 0 && <div>{preview.apiKeys} API keys</div>}
                  {preview.mcpServers > 0 && (
                    <div>{preview.mcpServers} MCP servers</div>
                  )}
                  {preview.agents > 0 && <div>{preview.agents} agents</div>}
                  {preview.prompts > 0 && <div>{preview.prompts} prompts</div>}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Exported {preview.exportedAt.toLocaleDateString()}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Import Mode</Label>
                <Select
                  value={importMode}
                  onValueChange={(v) => setImportMode(v as ImportMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">Merge with existing</SelectItem>
                    <SelectItem value="overwrite">Overwrite existing</SelectItem>
                    <SelectItem value="skip">Skip existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Import</Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importApiKeys}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importApiKeys: !!c }))
                      }
                      disabled={preview.apiKeys === 0}
                    />
                    API Keys
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importMcpServers}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({
                          ...o,
                          importMcpServers: !!c,
                        }))
                      }
                    />
                    MCP Servers
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importAgents}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importAgents: !!c }))
                      }
                    />
                    Agents
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importSettings}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importSettings: !!c }))
                      }
                    />
                    Settings
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  API keys are imported encrypted and stored locally (never cloud-synced).
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {step === "select" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "decrypt" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={handleDecrypt} disabled={isImporting || !password}>
                {isImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Decrypt
              </Button>
            </>
          )}
          {step === "configure" && (
            <>
              <Button variant="outline" onClick={() => setStep("decrypt")}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Shareable Link Dialog
function ShareableLinkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [expiration, setExpiration] = useState<ShareLinkExpirationOption>("6h");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof getExportSummary>
  > | null>(null);
  const [includeOptions, setIncludeOptions] = useState({
    mcpServers: true,
    agents: false,
    settings: false,
  });

  const loadSummary = async () => {
    const data = await getExportSummary();
    setSummary(data);
  };

  const resetState = () => {
    setPassword("");
    setConfirmPassword("");
    setExpiration("6h");
    setGeneratedUrl(null);
    setCopied(false);
    setIncludeOptions({
      mcpServers: true,
      agents: false,
      settings: false,
    });
  };

  const handleGenerate = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsGenerating(true);
    try {
      // Get settings data
      const allSettings = await exportAllSettings();

      // Filter based on selected options
      const filteredData = {
        version: allSettings.version,
        exportedAt: allSettings.exportedAt,
        data: {
          apiKeys: [], // API keys are never included in share links (local-only)
          mcpServers: includeOptions.mcpServers ? allSettings.data.mcpServers : [],
          agents: includeOptions.agents ? allSettings.data.agents : [],
          prompts: [], // Always exclude prompts from share links (too large)
          settings: includeOptions.settings ? allSettings.data.settings : null,
          modelFavorites: [],
          modelAliases: [],
          parameterPresets: [],
          tags: [],
          tagRules: [],
        },
      };

      const expiresAt = getShareLinkExpirationTimestamp(expiration);
      const url = await createShareableUrl(filteredData, password, expiresAt);

      // Check URL length (warn if > 8KB)
      if (url.length > 8000) {
        toast.warning("Link is very long. Some services may truncate it.");
      }

      setGeneratedUrl(url);
      toast.success("Shareable link created!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to create shareable link");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;

    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const expirationLabels: Record<ShareLinkExpirationOption, string> = {
    "1h": "1 hour",
    "6h": "6 hours",
    "24h": "24 hours",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) loadSummary();
        else resetState();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Create Shareable Link
          </DialogTitle>
          <DialogDescription>
            Generate a password-protected link to share your settings (API keys are excluded). The link expires automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!generatedUrl ? (
            <>
              {/* What to include */}
              <div className="space-y-2">
                <Label>Include in link</Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={includeOptions.mcpServers}
                      onCheckedChange={(c) =>
                        setIncludeOptions((o) => ({ ...o, mcpServers: !!c }))
                      }
                    />
                    <Server className="h-3 w-3" />
                    MCP Servers {summary && summary.mcpServers > 0 && `(${summary.mcpServers})`}
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={includeOptions.agents}
                      onCheckedChange={(c) =>
                        setIncludeOptions((o) => ({ ...o, agents: !!c }))
                      }
                    />
                    <Bot className="h-3 w-3" />
                    Agents {summary && summary.agents > 0 && `(${summary.agents})`}
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={includeOptions.settings}
                      onCheckedChange={(c) =>
                        setIncludeOptions((o) => ({ ...o, settings: !!c }))
                      }
                    />
                    <Settings className="h-3 w-3" />
                    Settings
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="share-password">Password</Label>
                <Input
                  id="share-password"
                  type="password"
                  placeholder="Enter a password (min 8 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="share-confirm-password">Confirm Password</Label>
                <Input
                  id="share-confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-2">
                <Label>Link Expiration</Label>
                <Select
                  value={expiration}
                  onValueChange={(v) => setExpiration(v as ShareLinkExpirationOption)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="6h">6 hours (recommended)</SelectItem>
                    <SelectItem value="24h">24 hours</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Short-lived links are safer for sharing sensitive data
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Generated URL */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Link generated successfully!
                </div>

                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Clock className="h-3 w-3" />
                    Expires in {expirationLabels[expiration]}
                  </div>
                  <div className="text-xs font-mono break-all max-h-24 overflow-y-auto">
                    {generatedUrl}
                  </div>
                </div>

                <Button onClick={handleCopy} className="w-full" variant="outline">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Link
                    </>
                  )}
                </Button>

                <div className="flex items-start gap-2 p-3 border rounded-md bg-yellow-500/10 border-yellow-500/30">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Share the password separately (via different channel). Never include the password in the same message as the link.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {!generatedUrl ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={
                  isGenerating ||
                  password.length < 8 ||
                  (!includeOptions.mcpServers && !includeOptions.agents && !includeOptions.settings)
                }
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Link2 className="mr-2 h-4 w-4" />
                    Generate Link
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setGeneratedUrl(null)}>
                Create Another
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExportImportSettings() {
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportScope, setExportScope] = useState<"all" | "chats" | "settings">("all");
  const [secureExportOpen, setSecureExportOpen] = useState(false);
  const [secureImportOpen, setSecureImportOpen] = useState(false);
  const [shareableLinkOpen, setShareableLinkOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Migration state
  const [migrationStatus, setMigrationStatus] = useState<{
    needsMigration: boolean;
    currentVersion: number;
    targetVersion: number;
    message?: string;
  } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    checkMigrationStatus();
  }, []);

  const checkMigrationStatus = async () => {
    const status = await checkMigration();
    setMigrationStatus(status);
  };

  const handleMigration = async () => {
    setIsMigrating(true);
    try {
      await forceMigration();
      toast.success("Database migrated successfully! Reloading...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.error("Migration failed. Please refresh the page manually.");
      console.error("[Migration] Error:", error);
      setIsMigrating(false);
    }
  };

  const handleExport = async () => {
    try {
      let data: any = {};

      // Export based on scope
      if (exportScope === "all" || exportScope === "chats") {
        const chats = await db.chats.toArray();
        const messages = await db.messages.toArray();
        const projects = await db.projects.toArray();
        const projectFiles = await db.projectFiles.toArray();
        const agents = await db.agents.toArray();
        const prompts = await db.prompts.toArray();

        data.chats = chats;
        data.messages = messages;
        data.projects = projects;
        data.projectFiles = projectFiles;
        data.agents = agents;
        data.prompts = prompts;
      }

      if (exportScope === "all" || exportScope === "settings") {
        const settings = await db.settings.toArray();
        const modelFavorites = await db.modelFavorites.toArray();
        const folders = await db.folders.toArray();

        data.settings = settings;
        data.modelFavorites = modelFavorites;
        data.folders = folders;
      }

      // Create blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumina-export-${Date.now()}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Data exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate data structure
      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format");
      }

      // Import data
      if (data.chats) await db.chats.bulkPut(data.chats);
      if (data.messages) await db.messages.bulkPut(data.messages);
      if (data.projects) await db.projects.bulkPut(data.projects);
      if (data.projectFiles) await db.projectFiles.bulkPut(data.projectFiles);
      if (data.agents) await db.agents.bulkPut(data.agents);
      if (data.prompts) await db.prompts.bulkPut(data.prompts);
      if (data.settings) await db.settings.bulkPut(data.settings);
      if (data.modelFavorites) await db.modelFavorites.bulkPut(data.modelFavorites);
      if (data.folders) await db.folders.bulkPut(data.folders);

      toast.success("Data imported successfully");

      // Reload page to refresh all data
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import data. Please check the file format.");
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAllChats = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all chats? This will remove all conversations but keep your settings."
      )
    ) {
      return;
    }

    try {
      await deleteAllChats();
      toast.success("All chats deleted");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Delete chats error:", error);
      toast.error("Failed to delete chats");
    }
  };

  const handleClearAllData = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL data? This action cannot be undone!"
      )
    ) {
      return;
    }

    try {
      await db.delete();
      await db.open();
      toast.success("All data cleared");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Clear data error:", error);
      toast.error("Failed to clear data");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Export & Import</h3>
        <p className="text-sm text-muted-foreground">
          Backup your data or import from another device
        </p>
      </div>

      {/* Database Migration Status */}
      {migrationStatus && (
        <div className={`space-y-4 p-4 border rounded-lg ${migrationStatus.needsMigration ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-green-500/50 bg-green-500/5'}`}>
          <h4 className="font-medium flex items-center gap-2">
            <Database className={`h-4 w-4 ${migrationStatus.needsMigration ? 'text-yellow-500' : 'text-green-500'}`} />
            Database Status
          </h4>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Version:</span>
              <span className="font-mono font-medium">v{migrationStatus.currentVersion}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Latest Version:</span>
              <span className="font-mono font-medium">v{migrationStatus.targetVersion}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
              {migrationStatus.needsMigration ? (
                <span className="text-yellow-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Migration Required
                </span>
              ) : (
                <span className="text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Up to Date
                </span>
              )}
            </div>

            {migrationStatus.needsMigration && (
              <>
                <p className="text-xs text-muted-foreground pt-2 border-t">
                  {migrationStatus.message}
                </p>
                <Button
                  onClick={handleMigration}
                  disabled={isMigrating}
                  className="w-full"
                  size="sm"
                >
                  {isMigrating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Run Migration
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  This will close and reopen the database to apply the migration. Your data will be preserved.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Export Section */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-medium flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Data
        </h4>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="export-scope">What to export</Label>
            <Select value={exportScope} onValueChange={(v: any) => setExportScope(v)}>
              <SelectTrigger id="export-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                <SelectItem value="chats">Chats & Messages only</SelectItem>
                <SelectItem value="settings">Settings only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-format">Format</Label>
            <Select value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
              <SelectTrigger id="export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    JSON (Recommended)
                  </div>
                </SelectItem>
                <SelectItem value="csv" disabled>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    CSV (Coming soon)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleExport} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Import Section */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-medium flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Import Data
        </h4>

        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 border rounded-md bg-muted/50">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600" />
            <p className="text-xs text-muted-foreground">
              Importing will merge with existing data. Duplicate IDs will be replaced.
            </p>
          </div>

          <Label
            htmlFor="import-file"
            className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent transition-colors"
          >
            <Upload className="h-5 w-5" />
            <span>{importing ? "Importing..." : "Click to select file"}</span>
            <Input
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              className="hidden"
            />
          </Label>
        </div>
      </div>

      {/* Secure Backup Section */}
      <div className="space-y-4 p-4 border rounded-lg border-primary/30 bg-primary/5">
        <h4 className="font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Secure Backup (Encrypted)
        </h4>
        <p className="text-sm text-muted-foreground">
          Export settings with password protection. Safe to share via Google Drive or other cloud storage.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setSecureExportOpen(true)}
            className="flex-1"
          >
            <Lock className="h-4 w-4 mr-2" />
            Export Encrypted
          </Button>
          <Button
            variant="outline"
            onClick={() => setSecureImportOpen(true)}
            className="flex-1"
          >
            <Shield className="h-4 w-4 mr-2" />
            Import Encrypted
          </Button>
        </div>
      </div>

      <SecureExportDialog open={secureExportOpen} onOpenChange={setSecureExportOpen} />
      <SecureImportDialog open={secureImportOpen} onOpenChange={setSecureImportOpen} />

      {/* Danger Zone */}
      <div className="space-y-4 p-4 border border-destructive rounded-lg">
        <h4 className="font-medium flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
        </h4>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Delete all chat conversations but keep your settings and preferences.
            </p>
            <Button
              variant="outline"
              onClick={handleDeleteAllChats}
              className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Chats
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Permanently delete all data from this device. This action cannot be undone.
            </p>
            <Button
              variant="destructive"
              onClick={handleClearAllData}
              className="w-full"
            >
              Clear All Data
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
