"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Key, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { decryptApiKeys } from "@/components/settings/api-key-transfer";
import { useApiKeysStore } from "@/stores/api-keys-store";

type ImportState = "loading" | "scan" | "password" | "importing" | "done" | "error";

export default function ImportKeysPage() {
  const router = useRouter();
  const { addKey, keys: existingKeys, loadKeys, isLoaded } = useApiKeysStore();
  const [state, setState] = useState<ImportState>("loading");
  const [encrypted, setEncrypted] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Load API keys store if not loaded
  useEffect(() => {
    if (!isLoaded) {
      loadKeys();
    }
  }, [isLoaded, loadKeys]);

  const loadFromHash = async () => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!hash) {
      // No hash - show scanner option
      setState("scan");
      return;
    }

    // Validate it looks like encrypted data (base64-ish)
    if (!/^[A-Za-z0-9_-]+$/.test(hash)) {
      setError("Invalid transfer data format.");
      setState("error");
      return;
    }

    setEncrypted(hash);
    setState("password");
  };

  useEffect(() => {
    loadFromHash();
    return () => {
      stopScanner();
    };
  }, []);

  const canSubmit = useMemo(() => password.length >= 6, [password]);

  const handleDecrypt = async () => {
    if (!encrypted) return;
    if (!canSubmit) {
      toast.error("Enter a password with at least 6 characters.");
      return;
    }

    setState("importing");
    try {
      const decrypted = await decryptApiKeys(encrypted, password);

      // Check expiration
      if (decrypted.exp && Date.now() > decrypted.exp) {
        setError("This transfer has expired. Please generate a new one from your source device.");
        setState("error");
        return;
      }

      let imported = 0;
      for (const keyData of decrypted.keys) {
        try {
          // Check if key for this provider already exists
          const existing = existingKeys.find((k) => k.provider === keyData.provider);
          if (existing) {
            // Skip if already exists
            continue;
          }
          await addKey(keyData.provider, keyData.key, keyData.label, keyData.baseUrl);
          imported++;
        } catch {
          // Continue with other keys
        }
      }

      setImportedCount(imported);
      setState("done");
    } catch (err) {
      setError("Failed to decrypt. Check your password and try again.");
      setState("error");
    }
  };

  const handleScanResult = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Check if it's a full URL to this page
    if (trimmed.includes("/import/keys#")) {
      const hash = trimmed.split("#")[1];
      if (hash) {
        stopScanner();
        setEncrypted(hash);
        setState("password");
        return;
      }
    }

    // Check if it's just the hash data
    if (/^[A-Za-z0-9_-]+$/.test(trimmed) && trimmed.length > 50) {
      stopScanner();
      setEncrypted(trimmed);
      setState("password");
      return;
    }

    setScanError("QR code does not contain valid API key transfer data.");
  };

  const stopScanner = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setScannerActive(false);
  };

  const startScanner = async () => {
    setScanError(null);
    if (typeof window === "undefined" || !(window as any).BarcodeDetector) {
      setScanError("QR scanning is not supported in this browser. Try pasting the link manually.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScannerActive(true);
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results?.length) {
            await handleScanResult(results[0].rawValue);
          }
        } catch {
          // Detection failed, continue scanning
        }
      }, 500);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Failed to access camera.");
      stopScanner();
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);

      if (parsed.type !== "lumina-api-keys" || !parsed.encrypted) {
        setError("Invalid file format. Please select a valid .lumina API keys file.");
        setState("error");
        return;
      }

      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        setError("This file has expired. Please generate a new transfer.");
        setState("error");
        return;
      }

      setEncrypted(parsed.encrypted);
      setState("password");
    } catch {
      setError("Failed to read file. Make sure it's a valid .lumina file.");
      setState("error");
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Import API Keys
          </CardTitle>
          <CardDescription>Transfer API keys from another device</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}

          {state === "scan" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Scan the QR code from your source device, paste a transfer link, or import a .lumina file.
              </div>

              {/* QR Scanner */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Scan QR Code</div>
                  <Button variant="outline" size="sm" onClick={scannerActive ? stopScanner : startScanner}>
                    <Camera className="h-4 w-4 mr-2" />
                    {scannerActive ? "Stop" : "Scan"}
                  </Button>
                </div>
                {scannerActive && (
                  <video ref={videoRef} className="w-full rounded-md border aspect-square object-cover" />
                )}
                {scanError && (
                  <div className="text-xs text-red-600">{scanError}</div>
                )}
              </div>

              {/* File Import */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="text-sm font-medium">Import from File</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".lumina"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Select .lumina file
                </Button>
              </div>

              {/* Manual Link Entry */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="text-sm font-medium">Paste Transfer Link</div>
                <Input
                  placeholder="https://..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const value = (e.target as HTMLInputElement).value;
                      if (value.includes("/import/keys#")) {
                        const hash = value.split("#")[1];
                        if (hash) {
                          setEncrypted(hash);
                          setState("password");
                        }
                      }
                    }
                  }}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.includes("/import/keys#")) {
                      const hash = value.split("#")[1];
                      if (hash) {
                        setEncrypted(hash);
                        setState("password");
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {state === "password" && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                Enter the password you set when generating the transfer.
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-password">Transfer Password</Label>
                <Input
                  id="transfer-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit) handleDecrypt();
                  }}
                />
              </div>
              <Button onClick={handleDecrypt} disabled={!canSubmit} className="w-full">
                Import Keys
              </Button>
            </div>
          )}

          {state === "importing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing API keys...
            </div>
          )}

          {state === "done" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Import complete</div>
                  <div className="text-xs opacity-80">
                    {importedCount} API key{importedCount !== 1 ? "s" : ""} imported successfully.
                    {importedCount === 0 && " (keys may already exist)"}
                  </div>
                </div>
              </div>
              <Button onClick={() => router.push("/settings?tab=api-keys")} className="w-full">
                Go to API Keys
              </Button>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-3 text-sm text-red-700 dark:text-red-400">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Import failed
                </div>
                <div className="text-xs mt-1">{error}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setState("scan")} className="flex-1">
                  Try Again
                </Button>
                <Button variant="outline" onClick={() => router.push("/settings?tab=api-keys")} className="flex-1">
                  Go to Settings
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
