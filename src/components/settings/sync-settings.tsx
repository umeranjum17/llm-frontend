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
  const [region, setRegion] = useState("us-east-1");
  const [deviceIdCopied, setDeviceIdCopied] = useState(false);

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

    try {
      const result = await sync((progress) => {
        setSyncProgress(progress);
      });

      if (result.success) {
        toast.success(
          `Sync complete: ${result.uploaded} uploaded, ${result.downloaded} downloaded, ${result.applied} applied`
        );
      } else {
        toast.error(`Sync failed: ${result.error}`);
      }

      loadSyncStatus();
    } catch (error) {
      toast.error("Sync failed");
      console.error(error);
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
              <Label htmlFor="region">Region (optional)</Label>
              <Input
                id="region"
                placeholder="us-east-1"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
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
