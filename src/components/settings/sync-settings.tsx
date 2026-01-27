"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Lock,
  Unlock,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { getAutoSyncMode, getS3Config, setAutoSyncMode, type AutoSyncMode } from "@/lib/sync/device-id";
import {
  sync,
  getSyncStatus,
  type SyncProgress,
} from "@/lib/sync/sync-manager";
import { SyncWizard } from "@/components/settings/sync-wizard/sync-wizard";
import { S3Adapter } from "@/lib/sync/s3-adapter";
import { getDeviceId, setDeviceName } from "@/lib/sync/device-id";
import { useApiKeysStore } from "@/stores/api-keys-store";

export function SyncSettings() {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncStatus, setSyncStatus] = useState({
    configured: false,
    configLocked: false,
    deviceId: "",
    lastSyncAt: 0,
    pendingChanges: 0,
  });
  const { vault, requestVaultUnlock } = useApiKeysStore();
  const [s3Config, setS3ConfigState] = useState<{
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region?: string;
  } | null>(null);
  const [autoSyncMode, setAutoSyncModeState] = useState<AutoSyncMode>("manual");
  const [devices, setDevices] = useState<Array<{
    id: string;
    name: string;
    platform?: string;
    lastSyncAt: number;
    isCurrent: boolean;
  }>>([]);

  const [deviceIdCopied, setDeviceIdCopied] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Load sync status on mount, poll for updates, and reload when vault unlocks
  useEffect(() => {
    loadSyncStatus();
    loadS3Config();
    loadAutoSyncMode();
    loadDevices();
    // Note: Change tracking is initialized in global-hooks, not here

    // Poll for status updates every 2 seconds to show pending changes
    const interval = setInterval(() => {
      loadSyncStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Reload when vault state changes (especially unlocked)
  useEffect(() => {
    loadSyncStatus();
    loadS3Config();
    loadDevices();
  }, [vault.isUnlocked]);

  const loadSyncStatus = async () => {
    const status = await getSyncStatus();
    setSyncStatus(status);
  };

  const loadS3Config = () => {
    try {
      const config = getS3Config();
      setS3ConfigState(config);
    } catch (error) {
      console.error("[SyncSettings] Error loading config:", error);
    }
  };

  const loadAutoSyncMode = async () => {
    try {
      const mode = await getAutoSyncMode();
      setAutoSyncModeState(mode);
    } catch (error) {
      console.error("[SyncSettings] Error loading auto-sync mode:", error);
    }
  };

  const loadDevices = async () => {
    try {
      const adapter = S3Adapter.fromConfig();
      if (!adapter) return;
      const manifest = await adapter.getManifest();
      const currentId = await getDeviceId();
      const deviceList = Object.entries(manifest.devices).map(([id, info]) => ({
        id,
        name: info.deviceName || "Device",
        platform: info.platform,
        lastSyncAt: info.lastSyncAt,
        isCurrent: id === currentId,
      }));
      deviceList.sort((a, b) => b.lastSyncAt - a.lastSyncAt);
      setDevices(deviceList);
    } catch (error) {
      console.error("[SyncSettings] Error loading devices:", error);
    }
  };

  const handleOpenWizard = () => {
    // Reload config from store before opening dialog
    loadS3Config();
    setIsWizardOpen(true);
  };

  const handleAutoSyncChange = async (value: string) => {
    const mode = value as AutoSyncMode;
    setAutoSyncModeState(mode);
    await setAutoSyncMode(mode);
    toast.success("Auto-sync preference saved");
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
        // Reload status to update Last Sync timestamp and clear any errors
        await loadSyncStatus();
        await loadDevices();
      } else {
        toast.error(`Sync failed: ${result.error}`);
        setLastSyncError(result.error || "Unknown error");

      }

      loadSyncStatus();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Sync failed");
      console.error(error);
      setLastSyncError(errorMessage);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleRenameDevice = async (deviceId: string, currentName: string) => {
    const nextName = window.prompt("Enter a new device name", currentName);
    if (!nextName || nextName.trim() === currentName) return;
    const adapter = S3Adapter.fromConfig();
    if (!adapter) return;
    const manifest = await adapter.getManifest();
    if (!manifest.devices[deviceId]) return;
    manifest.devices[deviceId].deviceName = nextName.trim();
    await adapter.updateManifest(manifest);
    const localId = await getDeviceId();
    if (deviceId === localId) {
      await setDeviceName(nextName.trim());
    }
    await loadDevices();
    toast.success("Device name updated");
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm("Remove this device from the sync list? It will need to reconnect to sync again.")) {
      return;
    }
    const adapter = S3Adapter.fromConfig();
    if (!adapter) return;
    const manifest = await adapter.getManifest();
    if (!manifest.devices[deviceId]) return;
    delete manifest.devices[deviceId];
    await adapter.updateManifest(manifest);
    await loadDevices();
    toast.success("Device removed");
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
                onClick={handleOpenWizard}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
              <Button
                size="sm"
                onClick={handleSync}
                disabled={!syncStatus.configured || syncStatus.configLocked || isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : syncStatus.configLocked ? (
                  <Lock className="h-4 w-4 mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {syncStatus.configLocked ? "Locked" : "Sync Now"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Vault Locked Warning */}
            {syncStatus.configLocked && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4">
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-amber-900 dark:text-amber-100">Vault Locked</div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    S3 credentials are protected by your vault passphrase. Unlock to sync.
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

            {/* Status */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                {syncStatus.configLocked ? (
                  <>
                    <Lock className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Locked</span>
                  </>
                ) : syncStatus.configured ? (
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

            {/* Auto-Sync */}
            <div className="flex items-center justify-between py-2 border-t">
              <div>
                <div className="text-sm font-medium">Auto-Sync</div>
                <div className="text-xs text-muted-foreground">
                  Run sync automatically when enabled
                </div>
              </div>
              <div className="w-40">
                <Select value={autoSyncMode} onValueChange={handleAutoSyncChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="focus">On focus</SelectItem>
                    <SelectItem value="5m">Every 5 min</SelectItem>
                    <SelectItem value="15m">Every 15 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                        This is a CORS error. Open the Sync setup wizard to see the CORS guide.
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
                            <strong>Token Permissions:</strong> Must have &ldquo;Object Read &amp; Write&rdquo; permissions
                          </li>
                          <li>
                            <strong>Bucket Name:</strong> Verify it matches exactly (case-sensitive)
                          </li>
                          <li>
                            <strong>Endpoint URL:</strong> Should be https://&lt;account-id&gt;.r2.cloudflarestorage.com
                          </li>
                        </ul>
                        <p className="text-[10px] mt-2">
                          💡 <strong>Tip:</strong> Try regenerating your R2 API token with &ldquo;Object Read &amp; Write&rdquo; permissions
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

      {/* Devices */}
      {syncStatus.configured && devices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>Manage devices connected to this sync bucket</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {devices.map((device) => (
                <div key={device.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {device.name}
                      {device.isCurrent && (
                        <span className="text-xs rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {device.platform || "Unknown platform"} · Last sync {formatTimestamp(device.lastSyncAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRenameDevice(device.id, device.name)}
                    >
                      Rename
                    </Button>
                    {!device.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeDevice(device.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <SyncWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        initialConfig={s3Config}
        onSaved={async () => {
          await loadSyncStatus();
          await loadDevices();
        }}
      />

      {/* What syncs vs local-only info card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            What syncs vs local-only
          </CardTitle>
          <CardDescription>Clear boundaries for your privacy model</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-2">
            <div className="font-medium">Synced (when enabled)</div>
            <ul className="list-disc ml-4 text-muted-foreground space-y-1">
              <li>Chats and messages</li>
              <li>Projects, folders, tags</li>
              <li>Agents, prompts, settings</li>
              <li>Model favorites and aliases</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-medium">Local-only</div>
            <ul className="list-disc ml-4 text-muted-foreground space-y-1">
              <li>API keys and vault passphrase</li>
              <li>Device secret + sync credentials</li>
              <li>Usage cache and local sessions</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
