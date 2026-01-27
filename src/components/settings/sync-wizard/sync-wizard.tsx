"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Cloud, Info, Loader2, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { S3Adapter } from "@/lib/sync/s3-adapter";
import { setS3Config } from "@/lib/sync/device-id";
import { useApiKeysStore } from "@/stores/api-keys-store";

type ProviderId = "r2" | "s3" | "minio" | "custom";

type WizardConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
};

const PROVIDERS: Array<{
  id: ProviderId;
  name: string;
  description: string;
  endpointPlaceholder: string;
  regionDefault: string;
  corsType: "r2" | "s3";
}> = [
  {
    id: "r2",
    name: "Cloudflare R2",
    description: "Fast, low-cost object storage with S3 compatibility",
    endpointPlaceholder: "https://<account-id>.r2.cloudflarestorage.com",
    regionDefault: "auto",
    corsType: "r2",
  },
  {
    id: "s3",
    name: "AWS S3",
    description: "AWS S3 bucket with standard SigV4 auth",
    endpointPlaceholder: "https://s3.amazonaws.com",
    regionDefault: "us-east-1",
    corsType: "s3",
  },
  {
    id: "minio",
    name: "MinIO (Self-hosted)",
    description: "Your own S3-compatible storage",
    endpointPlaceholder: "https://minio.example.com",
    regionDefault: "us-east-1",
    corsType: "s3",
  },
  {
    id: "custom",
    name: "Custom S3-compatible",
    description: "Any S3-compatible endpoint",
    endpointPlaceholder: "https://storage.example.com",
    regionDefault: "us-east-1",
    corsType: "s3",
  },
];

const STEPS = [
  { id: "provider", label: "Provider" },
  { id: "credentials", label: "Credentials" },
  { id: "cors", label: "CORS" },
  { id: "test", label: "Test & Save" },
];

function inferProviderId(endpoint?: string | null): ProviderId {
  if (!endpoint) return "r2";
  if (endpoint.includes("r2.cloudflarestorage.com")) return "r2";
  if (endpoint.includes("amazonaws.com")) return "s3";
  if (endpoint.toLowerCase().includes("minio")) return "minio";
  return "custom";
}

export function SyncWizard({
  open,
  onOpenChange,
  initialConfig,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: Partial<WizardConfig> | null;
  onSaved?: () => void;
}) {
  const { vault, requestVaultUnlock } = useApiKeysStore();
  const [step, setStep] = useState(0);
  const [providerId, setProviderId] = useState<ProviderId>(
    inferProviderId(initialConfig?.endpoint)
  );
  const [endpoint, setEndpoint] = useState(initialConfig?.endpoint || "");
  const [accessKeyId, setAccessKeyId] = useState(initialConfig?.accessKeyId || "");
  const [secretAccessKey, setSecretAccessKey] = useState(initialConfig?.secretAccessKey || "");
  const [bucket, setBucket] = useState(initialConfig?.bucket || "");
  const [region, setRegion] = useState(initialConfig?.region || "");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    message?: string;
    detail?: string;
  } | null>(null);

  const selectedProvider = useMemo(
    () => PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0],
    [providerId]
  );

  const resetState = () => {
    setStep(0);
    setProviderId(inferProviderId(initialConfig?.endpoint));
    setEndpoint(initialConfig?.endpoint || "");
    setAccessKeyId(initialConfig?.accessKeyId || "");
    setSecretAccessKey(initialConfig?.secretAccessKey || "");
    setBucket(initialConfig?.bucket || "");
    setRegion(initialConfig?.region || "");
    setIsTesting(false);
    setTestResult(null);
  };

  const handleSelectProvider = (id: ProviderId) => {
    setProviderId(id);
    const preset = PROVIDERS.find((p) => p.id === id);
    if (preset) {
      setEndpoint(preset.endpointPlaceholder);
      setRegion(preset.regionDefault);
    }
  };

  const validateCredentials = () => {
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      toast.error("Please fill in all required fields");
      return false;
    }
    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      toast.error("Endpoint must start with http:// or https://");
      return false;
    }
    if (endpoint.includes(`/${bucket}`)) {
      toast.error(`Remove "/${bucket}" from endpoint URL. Bucket should be entered separately.`);
      return false;
    }
    if (bucket.includes("/")) {
      toast.error("Bucket name should not contain slashes (/)");
      return false;
    }
    return true;
  };

  const handleTestConnection = async () => {
    if (!validateCredentials()) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const adapter = new S3Adapter({
        endpoint: endpoint.replace(/\/$/, ""),
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        bucket: bucket.trim(),
        region: region.trim() || "auto",
      });
      const result = await adapter.testConnection();
      if (result.ok) {
        setTestResult({ ok: true, latencyMs: result.latencyMs, message: "Connection successful." });
      } else {
        setTestResult({
          ok: false,
          latencyMs: result.latencyMs,
          message: result.error?.message || "Connection failed.",
          detail: result.error?.detail,
        });
      }
    } catch (error) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        message: "Connection failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!validateCredentials()) return;

    // Check if vault is locked
    if (vault.meta && !vault.isUnlocked) {
      toast.error("Unlock the vault to save S3 credentials");
      requestVaultUnlock();
      return;
    }

    try {
      await setS3Config({
        endpoint: endpoint.replace(/\/$/, ""),
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        bucket: bucket.trim(),
        region: region.trim() || "auto",
      });
      toast.success("Sync configuration saved");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save sync configuration");
    }
  };

  const isVaultLocked = vault.meta && !vault.isUnlocked;

  const renderCorsGuide = () => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const corsJson = `[
  {
    "AllowedOrigins": [
      "${origin}"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]`;

    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Required for browser sync</p>
            <p className="text-xs text-yellow-800">
              CORS must allow GET, PUT, POST, DELETE, HEAD and expose ETag.
            </p>
          </div>
        </div>
        <div className="rounded-md border bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
          {corsJson}
        </div>
        {selectedProvider.corsType === "r2" && (
          <div className="text-xs text-muted-foreground">
            R2: Bucket Settings → CORS Policy → paste JSON above.
          </div>
        )}
        {selectedProvider.corsType === "s3" && (
          <div className="text-xs text-muted-foreground">
            S3/MinIO: Bucket Permissions → CORS configuration → paste JSON above.
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetState();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set up Sync</DialogTitle>
          <DialogDescription>
            Connect an S3-compatible bucket to sync changes across devices.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {STEPS.map((item, index) => (
            <div
              key={item.id}
              className={`rounded-full border px-3 py-1 ${index === step ? "border-primary text-primary" : ""}`}
            >
              {index + 1}. {item.label}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="grid gap-3 py-4">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleSelectProvider(provider.id)}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                  provider.id === providerId ? "border-primary bg-primary/5" : "hover:border-primary/50"
                }`}
              >
                <Cloud className="h-5 w-5 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium">{provider.name}</div>
                  <div className="text-xs text-muted-foreground">{provider.description}</div>
                </div>
              </button>
            ))}
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground mb-1">Self-hosted quickstart (MinIO)</div>
              <div className="font-mono text-[11px] whitespace-pre-wrap">
{`docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=lumina \
  -e MINIO_ROOT_PASSWORD=changeme123 \
  quay.io/minio/minio server /data --console-address :9001`}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                placeholder={selectedProvider.endpointPlaceholder}
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Do not include the bucket name in the endpoint URL.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bucket">Bucket Name</Label>
                <Input
                  id="bucket"
                  placeholder="lumina-sync"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  placeholder={selectedProvider.regionDefault}
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessKeyId">Access Key ID</Label>
              <Input
                id="accessKeyId"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretAccessKey">Secret Access Key</Label>
              <Input
                id="secretAccessKey"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-900">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="text-sm">
                Configure CORS once for this bucket so browser sync can access it.
              </div>
            </div>
            {renderCorsGuide()}
          </div>
        )}

        {step === 3 && (
          <div className="py-4 space-y-4">
            {isVaultLocked && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4">
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-amber-900 dark:text-amber-100">Vault Locked</div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Unlock the vault to save S3 credentials. They will be encrypted with your passphrase.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => requestVaultUnlock()}
                  className="shrink-0"
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  Unlock
                </Button>
              </div>
            )}

            <div className="rounded-lg border p-4 text-sm space-y-2">
              <div className="font-medium">Connection test</div>
              <div className="text-xs text-muted-foreground">
                We will list the bucket and verify permissions.
              </div>
              <Button onClick={handleTestConnection} disabled={isTesting}>
                {isTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Test Connection
              </Button>
            </div>

            {testResult && (
              <div className={`rounded-lg border p-3 text-sm ${testResult.ok ? "border-green-300 bg-green-50" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                  <div className="font-medium">
                    {testResult.ok ? "Connected" : "Connection failed"}
                  </div>
                  {testResult.latencyMs > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {testResult.latencyMs}ms
                    </span>
                  )}
                </div>
                {testResult.message && (
                  <div className="text-xs text-muted-foreground mt-1">{testResult.message}</div>
                )}
                {testResult.detail && (
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    {testResult.detail}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              if (step === 0) {
                onOpenChange(false);
                return;
              }
              setStep((prev) => Math.max(0, prev - 1));
            }}
          >
            Back
          </Button>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => {
                  if (step === 1 && !validateCredentials()) return;
                  setStep((prev) => Math.min(STEPS.length - 1, prev + 1));
                }}
              >
                Next
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={!!isVaultLocked}>
                {isVaultLocked && <Lock className="h-4 w-4 mr-2" />}
                Save Configuration
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
