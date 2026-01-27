"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy, Download, Link2, Loader2, QrCode, Smartphone, Upload, Cloud } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useApiKeysStore, SYNC_S3_PROVIDER } from "@/stores/api-keys-store";

/**
 * Encrypts API keys for transfer - creates a short-lived encrypted payload
 */
async function encryptApiKeys(
  keys: Array<{ provider: string; key: string; label?: string; baseUrl?: string }>,
  password: string,
  expiresAt: number
): Promise<string> {
  const encoder = new TextEncoder();
  const data = JSON.stringify({ keys, exp: expiresAt });

  // Derive key from password
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(data)
  );

  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  // URL-safe base64
  return btoa(String.fromCharCode(...combined))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decrypts API keys from transfer payload
 */
export async function decryptApiKeys(
  encrypted: string,
  password: string
): Promise<{ keys: Array<{ provider: string; key: string; label?: string; baseUrl?: string }>; exp: number }> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Restore URL-safe base64
  const base64 = encrypted.replace(/-/g, "+").replace(/_/g, "/");
  const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return JSON.parse(decoder.decode(decrypted));
}

type TransferMethod = "qr" | "link" | "file";

export function ApiKeyTransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { keys, vault } = useApiKeysStore();

  // Count keys excluding sync-s3 for display, but include all in transfer
  const displayKeys = keys.filter((k) => k.provider !== SYNC_S3_PROVIDER);
  const hasS3Credentials = keys.some((k) => k.provider === SYNC_S3_PROVIDER);
  const [step, setStep] = useState<"configure" | "result">("configure");
  const [method, setMethod] = useState<TransferMethod>("qr");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setStep("configure");
    setMethod("qr");
    setPassword("");
    setConfirm("");
    setBusy(false);
    setQrDataUrl(null);
    setShareUrl(null);
    setCopied(false);
  };

  const handleGenerate = async () => {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      // Get minimal key data for transfer
      const keyData = keys.map((k) => ({
        provider: k.provider,
        key: k.key,
        label: k.label,
        baseUrl: k.baseUrl,
      }));

      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min expiry
      const encrypted = await encryptApiKeys(keyData, password, expiresAt);
      const origin = typeof window !== "undefined" ? window.location.origin : "";

      if (method === "qr" || method === "link") {
        const url = `${origin}/import/keys#${encrypted}`;
        setShareUrl(url);

        if (method === "qr") {
          // Generate QR code
          const qr = await QRCode.toDataURL(url, {
            width: 400,
            margin: 2,
            errorCorrectionLevel: "H",
          });
          setQrDataUrl(qr);
        }
      } else {
        // Download as .lumina file
        const fileData = JSON.stringify({
          type: "lumina-api-keys",
          version: 1,
          encrypted,
          expiresAt,
        });
        const blob = new Blob([fileData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lumina-api-keys-${new Date().toISOString().split("T")[0]}.lumina`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setStep("result");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate transfer");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const isVaultLocked = vault.meta && !vault.isUnlocked;
  const hasKeys = keys.length > 0;
  const canGenerate = hasKeys && !isVaultLocked && password.length >= 6 && password === confirm;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Transfer API Keys
          </DialogTitle>
          <DialogDescription>
            {step === "configure"
              ? `Transfer ${displayKeys.length} API key${displayKeys.length !== 1 ? "s" : ""} to another device`
              : method === "file"
                ? "File downloaded"
                : "Scan the QR code or copy the link"}
          </DialogDescription>
        </DialogHeader>

        {step === "configure" && (
          <div className="space-y-4 py-4">
            {isVaultLocked && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                Unlock the vault first to transfer API keys.
              </div>
            )}

            {!hasKeys && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                No API keys to transfer. Add some keys first.
              </div>
            )}

            {hasKeys && !isVaultLocked && (
              <>
                {hasS3Credentials && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                    <Cloud className="h-3.5 w-3.5 text-blue-500" />
                    <span>Includes S3 sync credentials</span>
                  </div>
                )}

                <Tabs value={method} onValueChange={(v) => setMethod(v as TransferMethod)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="qr" className="gap-1.5">
                      <QrCode className="h-3.5 w-3.5" />
                      QR Code
                    </TabsTrigger>
                    <TabsTrigger value="link" className="gap-1.5">
                      <Link2 className="h-3.5 w-3.5" />
                      Link
                    </TabsTrigger>
                    <TabsTrigger value="file" className="gap-1.5">
                      <Download className="h-3.5 w-3.5" />
                      File
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="qr" className="mt-3">
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      Generate a QR code to scan with your new device. Opens the import page automatically.
                    </div>
                  </TabsContent>
                  <TabsContent value="link" className="mt-3">
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      Copy a shareable link to paste in your new device&apos;s browser.
                    </div>
                  </TabsContent>
                  <TabsContent value="file" className="mt-3">
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      Download an encrypted .lumina file for offline transfer.
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="space-y-2">
                  <Label>Transfer Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirm password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canGenerate) handleGenerate();
                    }}
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  Expires in 10 minutes. Password required on new device.
                </div>
              </>
            )}
          </div>
        )}

        {step === "result" && method === "qr" && qrDataUrl && (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-white p-4">
              <img src={qrDataUrl} alt="API Key Transfer QR" className="h-64 w-64" />
              <p className="text-sm text-gray-600 text-center">
                Scan with your new device
              </p>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              <div><strong>Expires:</strong> 10 minutes</div>
              <div><strong>Password:</strong> Required on new device</div>
            </div>
          </div>
        )}

        {step === "result" && method === "link" && shareUrl && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              <div><strong>Expires:</strong> 10 minutes</div>
              <div><strong>Password:</strong> Required on new device</div>
              <div><strong>Tip:</strong> Share password through a different channel</div>
            </div>
          </div>
        )}

        {step === "result" && method === "file" && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-400">
              <Download className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">File downloaded</div>
                <div className="text-xs opacity-80">
                  Check your downloads folder for the .lumina file.
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
              <div><strong>Expires:</strong> 10 minutes</div>
              <div><strong>Import:</strong> Go to Settings &gt; API Keys on your new device</div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "configure" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={busy || !canGenerate}
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {method === "qr" ? "Generate QR" : method === "link" ? "Create Link" : "Download File"}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dialog for importing API keys from a .lumina file
 */
export function ApiKeyImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addKey, vault, keys: existingKeys } = useApiKeysStore();
  const [step, setStep] = useState<"select" | "password" | "importing" | "done">("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<{ encrypted: string; expiresAt: number } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("select");
    setSelectedFile(null);
    setFileData(null);
    setPassword("");
    setBusy(false);
    setImportedCount(0);
    setError(null);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);

      if (parsed.type !== "lumina-api-keys" || !parsed.encrypted) {
        setError("Invalid file format. Please select a valid .lumina API keys file.");
        return;
      }

      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        setError("This file has expired. Please generate a new transfer.");
        return;
      }

      setSelectedFile(file);
      setFileData(parsed);
      setStep("password");
      setError(null);
    } catch {
      setError("Failed to read file. Make sure it's a valid .lumina file.");
    }
  };

  const handleImport = async () => {
    if (!fileData || !password) return;

    setBusy(true);
    setError(null);
    try {
      const decrypted = await decryptApiKeys(fileData.encrypted, password);

      if (decrypted.exp && Date.now() > decrypted.exp) {
        setError("This transfer has expired. Please generate a new one.");
        setBusy(false);
        return;
      }

      setStep("importing");
      let imported = 0;

      for (const keyData of decrypted.keys) {
        try {
          // Check if key for this provider already exists
          const existing = existingKeys.find((k) => k.provider === keyData.provider);
          if (existing) {
            // Skip if already exists (user can manually remove if they want to replace)
            continue;
          }
          await addKey(keyData.provider, keyData.key, keyData.label, keyData.baseUrl);
          imported++;
        } catch {
          // Continue with other keys
        }
      }

      setImportedCount(imported);
      setStep("done");
    } catch {
      setError("Failed to decrypt. Check your password and try again.");
    } finally {
      setBusy(false);
    }
  };

  const isVaultLocked = vault.meta && !vault.isUnlocked;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import API Keys
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Select a .lumina file to import API keys"}
            {step === "password" && "Enter the transfer password"}
            {step === "importing" && "Importing..."}
            {step === "done" && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isVaultLocked && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              Unlock the vault first to import API keys.
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {error}
            </div>
          )}

          {step === "select" && !isVaultLocked && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".lumina"
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

          {step === "password" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="h-4 w-4" />
                {selectedFile?.name}
              </div>
              <div className="space-y-2">
                <Label>Transfer Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter the transfer password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && password) handleImport();
                  }}
                />
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Importing API keys...</span>
            </div>
          )}

          {step === "done" && (
            <div className="flex items-start gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-400">
              <Check className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Import complete</div>
                <div className="text-xs opacity-80">
                  {importedCount} API key{importedCount !== 1 ? "s" : ""} imported successfully.
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "select" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "password" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={busy || !password}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
