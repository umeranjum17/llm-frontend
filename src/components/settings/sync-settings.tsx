"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Settings,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Info,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { setS3Config, getS3Config } from "@/lib/sync/device-id";
import {
  sync,
  getSyncStatus,
  type SyncProgress,
} from "@/lib/sync/sync-manager";
import { initializeChangeTracking } from "@/lib/sync/change-tracker";

export function SyncSettings() {
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncStatus, setSyncStatus] = useState({
    configured: false,
    deviceId: "",
    lastSyncAt: 0,
    pendingChanges: 0,
  });

  // S3 config form
  const [endpoint, setEndpoint] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("auto");
  const [deviceIdCopied, setDeviceIdCopied] = useState(false);
  const [showCorsHelp, setShowCorsHelp] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Load sync status on mount
  useEffect(() => {
    loadSyncStatus();
    loadS3Config();

    // Initialize change tracking
    initializeChangeTracking();
  }, []);

  const loadSyncStatus = async () => {
    const status = await getSyncStatus();
    setSyncStatus(status);
  };

  const loadS3Config = async () => {
    const config = await getS3Config();
    if (config) {
      setEndpoint(config.endpoint);
      setAccessKeyId(config.accessKeyId);
      setSecretAccessKey(config.secretAccessKey);
      setBucket(config.bucket);
      setRegion(config.region || "us-east-1");
    }
  };

  const handleSaveConfig = async () => {
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await setS3Config({
        endpoint,
        accessKeyId,
        secretAccessKey,
        bucket,
        region,
      });

      toast.success("S3 configuration saved");
      setIsConfigDialogOpen(false);
      loadSyncStatus();
    } catch (error) {
      toast.error("Failed to save S3 configuration");
      console.error(error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncProgress(null);
    setLastSyncError(null);

    try {
      const result = await sync((progress) => {
        setSyncProgress(progress);
      });

      if (result.success) {
        toast.success(
          `Sync complete: ${result.uploaded} uploaded, ${result.downloaded} downloaded, ${result.applied} applied`
        );
        setLastSyncError(null);
      } else {
        toast.error(`Sync failed: ${result.error}`);
        setLastSyncError(result.error || "Unknown error");

        // Auto-show CORS help if it's a CORS error
        if (result.error?.toLowerCase().includes("cors") ||
            result.error?.toLowerCase().includes("access-control")) {
          setShowCorsHelp(true);
        }
      }

      loadSyncStatus();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Sync failed");
      console.error(error);
      setLastSyncError(errorMessage);

      // Auto-show CORS help if it's a CORS error
      if (errorMessage.toLowerCase().includes("cors") ||
          errorMessage.toLowerCase().includes("access-control")) {
        setShowCorsHelp(true);
      }
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const copyDeviceId = () => {
    navigator.clipboard.writeText(syncStatus.deviceId);
    setDeviceIdCopied(true);
    setTimeout(() => setDeviceIdCopied(false), 2000);
    toast.success("Device ID copied to clipboard");
  };

  const formatTimestamp = (timestamp: number) => {
    if (timestamp === 0) return "Never";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Sync Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {syncStatus.configured ? (
                  <Cloud className="h-5 w-5 text-green-500" />
                ) : (
                  <CloudOff className="h-5 w-5 text-gray-400" />
                )}
                Delta Sync
              </CardTitle>
              <CardDescription>
                Sync only changes between devices using S3-compatible storage
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfigDialogOpen(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
              <Button
                size="sm"
                onClick={handleSync}
                disabled={!syncStatus.configured || isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                {syncStatus.configured ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Configured</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">Not configured</span>
                  </>
                )}
              </div>
            </div>

            {/* Device ID */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Device ID</span>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {syncStatus.deviceId || "Not generated"}
                </code>
                {syncStatus.deviceId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyDeviceId}
                    className="h-6 w-6 p-0"
                  >
                    {deviceIdCopied ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Last Sync */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Last Sync</span>
              <span className="text-sm">
                {formatTimestamp(syncStatus.lastSyncAt)}
              </span>
            </div>

            {/* Pending Changes */}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                Pending Changes
              </span>
              <span className="text-sm font-medium">
                {syncStatus.pendingChanges}
              </span>
            </div>

            {/* Sync Progress */}
            {syncProgress && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{syncProgress.message}</span>
                </div>
              </div>
            )}

            {/* Info */}
            {!syncStatus.configured && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                  <div className="text-xs text-blue-600 dark:text-blue-400">
                    <p className="font-medium mb-1">Delta Sync</p>
                    <p>
                      Configure S3-compatible storage to sync only changes
                      between devices. This is much more efficient than
                      full exports.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* CORS Help */}
            {syncStatus.configured && (
              <div className="mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCorsHelp(!showCorsHelp)}
                  className="text-xs"
                >
                  <Info className="h-3 w-3 mr-1" />
                  {showCorsHelp ? "Hide" : "Show"} CORS Setup Instructions
                </Button>

                {showCorsHelp && (
                  <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                      <div className="text-xs text-yellow-800 dark:text-yellow-300">
                        <p className="font-semibold mb-2">First Time Setup: Configure CORS</p>
                        <p className="mb-2">
                          If sync fails with "Failed to fetch" or CORS errors, you need to configure CORS on your bucket.
                        </p>
                        <div className="mb-2 p-2 bg-yellow-200 dark:bg-yellow-800 rounded text-[11px] space-y-1">
                          <div>
                            <strong>⚠️ Important:</strong> You must include ALL 5 HTTP methods (GET, PUT, POST, DELETE, HEAD)
                            and the ETag expose header, or sync will fail.
                          </div>
                          <div className="text-[10px]">
                            <strong>Common issues:</strong>
                            <ul className="list-disc ml-4 mt-1">
                              <li>Verify the policy saved without errors (check for red error message)</li>
                              <li>Wait 10-30 seconds after saving for changes to take effect</li>
                              <li>Ensure JSON is valid (no syntax errors)</li>
                            </ul>
                          </div>
                        </div>

                        <div className="space-y-2 mb-2">
                          <p className="font-medium">For Cloudflare R2:</p>
                          <ol className="list-decimal list-inside space-y-1 ml-2 text-[11px]">
                            <li>Go to R2 Dashboard → Select your bucket</li>
                            <li>Click <strong>Settings</strong> tab</li>
                            <li>Find <strong>CORS Policy</strong> section and click <strong>Edit</strong></li>
                            <li>
                              <strong>Allowed Methods:</strong> Must include all 5: GET, PUT, POST, DELETE, HEAD
                            </li>
                            <li>
                              <strong>Allowed Headers:</strong> Set to * (asterisk)
                            </li>
                            <li>
                              <strong>Expose Headers:</strong> Add "ETag" (click Add header if needed)
                            </li>
                            <li>Save the policy</li>
                          </ol>
                        </div>

                        <div className="space-y-2 mb-2">
                          <p className="font-medium">For AWS S3:</p>
                          <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li>Go to S3 Console → Select your bucket</li>
                            <li>Click <strong>Permissions</strong> tab</li>
                            <li>Scroll to <strong>CORS configuration</strong></li>
                            <li>Add the policy below and save</li>
                          </ol>
                        </div>

                        <div className="bg-yellow-100 dark:bg-yellow-900 p-2 rounded border border-yellow-300 dark:border-yellow-700 font-mono text-[10px] overflow-x-auto">
                          <pre>{`[
  {
    "AllowedOrigins": [
      "${window.location.origin}"
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
]`}</pre>
                        </div>

                        <p className="mt-2 text-[10px] flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          <a
                            href="https://developers.cloudflare.com/r2/buckets/cors/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-yellow-900 dark:hover:text-yellow-200"
                          >
                            Cloudflare R2 CORS Documentation
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Last Error */}
            {lastSyncError && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-600 dark:text-red-400">
                    <p className="font-medium mb-1">Last Sync Error</p>
                    <p className="font-mono text-[10px]">{lastSyncError}</p>

                    {/* CORS Error Help */}
                    {(lastSyncError.toLowerCase().includes("cors") ||
                      lastSyncError.toLowerCase().includes("access-control")) && (
                      <p className="mt-2">
                        This is a CORS error. Please configure CORS on your bucket (see instructions above).
                      </p>
                    )}

                    {/* 401 Unauthorized Error Help */}
                    {(lastSyncError.includes("401") ||
                      lastSyncError.toLowerCase().includes("unauthorized") ||
                      lastSyncError.toLowerCase().includes("403") ||
                      lastSyncError.toLowerCase().includes("forbidden")) && (
                      <div className="mt-2 space-y-2">
                        <p className="font-semibold">Authentication Error (401/403)</p>
                        <p>Your credentials are incorrect or lack permissions. Please check:</p>
                        <ul className="list-disc ml-4 text-[10px] space-y-1">
                          <li>
                            <strong>Access Key ID</strong> and <strong>Secret Access Key</strong> are correct
                          </li>
                          <li>
                            <strong>Token Permissions:</strong> Must have "Object Read & Write" permissions
                          </li>
                          <li>
                            <strong>Bucket Name:</strong> Verify it matches exactly (case-sensitive)
                          </li>
                          <li>
                            <strong>Endpoint URL:</strong> Should be https://&lt;account-id&gt;.r2.cloudflarestorage.com
                          </li>
                        </ul>
                        <p className="text-[10px] mt-2">
                          💡 <strong>Tip:</strong> Try regenerating your R2 API token with "Object Read & Write" permissions
                          and updating the credentials in the configuration.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* S3 Configuration Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>S3 Configuration</DialogTitle>
            <DialogDescription>
              Configure S3-compatible storage for delta sync. Supports AWS S3,
              Cloudflare R2, MinIO, and more.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                placeholder="https://s3.amazonaws.com"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                For Cloudflare R2: https://&lt;account-id&gt;.r2.cloudflarestorage.com
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bucket">Bucket Name</Label>
              <Input
                id="bucket"
                placeholder="my-lumina-sync"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                placeholder="auto"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                For Cloudflare R2: use "auto". For AWS S3: use your bucket region (e.g., "us-east-1")
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessKeyId">Access Key ID</Label>
              <Input
                id="accessKeyId"
                placeholder="AKIAIOSFODNN7EXAMPLE"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secretAccessKey">Secret Access Key</Label>
              <Input
                id="secretAccessKey"
                type="password"
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfigDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveConfig}>Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
