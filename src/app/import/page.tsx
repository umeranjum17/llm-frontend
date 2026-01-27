"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseShareableUrl, decryptSettings } from "@/lib/crypto/settings-crypto";
import { getImportPreview, importSettings, validateSettingsExport } from "@/lib/db/import-settings";
import type { SettingsExport } from "@/lib/db/export-settings";
import { toast } from "sonner";

type ImportState = "loading" | "password" | "ready" | "importing" | "done" | "error";

export default function ImportPage() {
  const router = useRouter();
  const [state, setState] = useState<ImportState>("loading");
  const [encrypted, setEncrypted] = useState<string | null>(null);
  const [decryptedData, setDecryptedData] = useState<SettingsExport | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof getImportPreview> | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const loadFromHash = async () => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!hash) {
      setError("No transfer data found.");
      setState("error");
      return;
    }
    const parsed = await parseShareableUrl(hash);
    if (!parsed) {
      setError("Invalid or expired transfer link.");
      setState("error");
      return;
    }
    setEncrypted(parsed);
    setState("password");
  };

  useEffect(() => {
    loadFromHash();
    return () => {
      stopScanner();
    };
  }, []);

  const canSubmit = useMemo(() => password.length >= 8, [password]);

  const handleDecrypt = async () => {
    if (!encrypted) return;
    if (!canSubmit) {
      toast.error("Enter a password with at least 8 characters.");
      return;
    }
    try {
      const decrypted = await decryptSettings(encrypted, password);
      if (!validateSettingsExport(decrypted)) {
        setError("Decrypted data is invalid or corrupted.");
        setState("error");
        return;
      }
      const previewData = getImportPreview(decrypted);
      setPreview(previewData);
      setDecryptedData(decrypted);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decrypt transfer.");
      setState("error");
    }
  };

  const handleImport = async () => {
    if (!decryptedData || !preview) return;
    setState("importing");
    try {
      const result = await importSettings(decryptedData, {
        mode: "merge",
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
      if (result.success || result.errors.length === 0) {
        setState("done");
      } else {
        setError(`Import completed with ${result.errors.length} errors.`);
        setState("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setState("error");
    }
  };

  const handleScanResult = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.includes("/import#")) {
      window.location.href = trimmed;
      return;
    }
    if (trimmed.startsWith("#")) {
      window.location.hash = trimmed;
      await loadFromHash();
      return;
    }
    if (trimmed.startsWith("http")) {
      window.location.href = trimmed;
      return;
    }
    setScanError("QR code does not contain a valid transfer link.");
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
      setScanError("QR scanning is not supported in this browser.");
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
        const results = await detector.detect(videoRef.current);
        if (results?.length) {
          stopScanner();
          await handleScanResult(results[0].rawValue);
        }
      }, 500);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Failed to access camera.");
      stopScanner();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Import Transfer
          </CardTitle>
          <CardDescription>Decrypt and import your settings to this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing transfer...
            </div>
          )}

          {state === "password" && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Scan QR code</div>
                  <Button variant="outline" size="sm" onClick={scannerActive ? stopScanner : startScanner}>
                    <Camera className="h-4 w-4 mr-2" />
                    {scannerActive ? "Stop" : "Scan"}
                  </Button>
                </div>
                {scannerActive && (
                  <video ref={videoRef} className="w-full rounded-md border" />
                )}
                {scanError && (
                  <div className="text-xs text-red-600">{scanError}</div>
                )}
              </div>

              <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="transfer-password">
                  Password
                </label>
                <Input
                  id="transfer-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button onClick={handleDecrypt} disabled={!canSubmit} className="w-full">
                Decrypt Transfer
              </Button>
              </div>
            </div>
          )}

          {state === "ready" && preview && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
                <div className="font-medium">Ready to import</div>
                <div className="text-muted-foreground">
                  {[
                    preview.agents > 0 && `${preview.agents} agents`,
                    preview.prompts > 0 && `${preview.prompts} prompts`,
                    preview.mcpServers > 0 && `${preview.mcpServers} MCP servers`,
                    preview.modelFavorites > 0 && `${preview.modelFavorites} favorites`,
                  ].filter(Boolean).join(" · ") || "Settings"}
                </div>
              </div>
              <Button onClick={handleImport} className="w-full">
                Import Now
              </Button>
            </div>
          )}

          {state === "importing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </div>
          )}

          {state === "done" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Import complete.
              </div>
              <Button onClick={() => router.push("/")} className="w-full">
                Go to Lumina
              </Button>
            </div>
          )}

          {state === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Transfer failed
              </div>
              <div className="text-xs mt-1">{error}</div>
              <div className="mt-3 space-y-2">
                <Button variant="outline" onClick={scannerActive ? stopScanner : startScanner} className="w-full">
                  <Camera className="h-4 w-4 mr-2" />
                  {scannerActive ? "Stop scanning" : "Scan QR instead"}
                </Button>
                {scannerActive && (
                  <video ref={videoRef} className="w-full rounded-md border" />
                )}
                {scanError && (
                  <div className="text-xs text-red-600">{scanError}</div>
                )}
              </div>
              <Button variant="outline" onClick={() => router.push("/settings?tab=data")} className="w-full mt-3">
                Open Settings
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
