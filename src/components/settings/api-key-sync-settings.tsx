"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SyncPasswordDialog } from "@/components/dialogs/sync-password-dialog";
import {
  enableApiKeySync,
  syncApiKeys,
  downloadAndSetupKeys,
  disableApiKeySync,
  changeSyncPassword,
} from "@/lib/sync/api-key-sync-manager";
import { getSettings } from "@/lib/db/queries";
import { getS3Config } from "@/lib/sync/device-id";
import { toast } from "sonner";
import { Shield, RefreshCw, Key, AlertTriangle, Download, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function ApiKeySyncSettings() {
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [s3Configured, setS3Configured] = useState(false);
  const [hint, setHint] = useState<string | undefined>();
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>();
  const [isSyncing, setIsSyncing] = useState(false);
  const [passwordDialogMode, setPasswordDialogMode] = useState<"setup" | "sync" | "change">("setup");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await getSettings();
      setSyncEnabled(settings.apiKeySyncEnabled || false);
      setHint(settings.apiKeySyncHint);
      setLastSyncAt(settings.lastApiKeySyncAt);

      // Check if S3 is configured
      const s3Config = await getS3Config();
      setS3Configured(!!s3Config);
    } catch (error) {
      console.error("[ApiKeySyncSettings] Failed to load settings:", error);
    }
  };

  const handleEnableSync = () => {
    if (!s3Configured) {
      toast.error("Please configure S3 sync first in the Data Sync section");
      return;
    }

    setPasswordDialogMode("setup");
    setShowPasswordDialog(true);
  };

  const handleSyncNow = () => {
    setPasswordDialogMode("sync");
    setShowPasswordDialog(true);
  };

  const handleChangePassword = () => {
    setPasswordDialogMode("change");
    setShowPasswordDialog(true);
  };

  const handleDisableSync = async () => {
    try {
      await disableApiKeySync();
      await loadSettings();
      toast.success("API key sync disabled and remote keys deleted");
    } catch (error) {
      console.error("[ApiKeySyncSettings] Failed to disable sync:", error);
      toast.error("Failed to disable sync");
    }
  };

  const handleDownloadKeys = () => {
    setShowDownloadDialog(true);
  };

  const handlePasswordSubmit = async (password: string, hint?: string) => {
    if (passwordDialogMode === "setup") {
      // Enable sync
      setIsSyncing(true);
      try {
        const result = await enableApiKeySync(password, hint);
        if (result.success) {
          toast.success(`Sync enabled. Uploaded ${result.uploaded} keys.`);
          await loadSettings();
        } else {
          toast.error(result.error || "Failed to enable sync");
        }
      } catch (error) {
        console.error("[ApiKeySyncSettings] Enable sync error:", error);
        toast.error("Failed to enable sync");
      } finally {
        setIsSyncing(false);
      }
    } else if (passwordDialogMode === "sync") {
      // Sync now
      setIsSyncing(true);
      try {
        const result = await syncApiKeys(password);
        if (result.success) {
          const messages = [];
          if (result.uploaded > 0) messages.push(`${result.uploaded} uploaded`);
          if (result.downloaded > 0) messages.push(`${result.downloaded} downloaded`);
          if (result.conflicts > 0) messages.push(`${result.conflicts} conflicts resolved`);

          const message = messages.length > 0
            ? `Sync complete: ${messages.join(", ")}`
            : "Sync complete: Already up to date";

          toast.success(message);
          await loadSettings();
        } else {
          toast.error(result.error || "Sync failed");
        }
      } catch (error) {
        console.error("[ApiKeySyncSettings] Sync error:", error);
        toast.error("Sync failed");
      } finally {
        setIsSyncing(false);
      }
    } else if (passwordDialogMode === "change") {
      // Change password
      setIsSyncing(true);
      try {
        // Password format: "oldPassword|newPassword"
        const [oldPassword, newPassword] = password.split("|");
        const result = await changeSyncPassword(oldPassword, newPassword, hint);
        if (result.success) {
          toast.success("Password changed successfully");
          await loadSettings();
        } else {
          toast.error(result.error || "Failed to change password");
        }
      } catch (error) {
        console.error("[ApiKeySyncSettings] Change password error:", error);
        toast.error("Failed to change password");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleDownloadConfirm = () => {
    setShowDownloadDialog(false);
    setPasswordDialogMode("sync");
    setShowPasswordDialog(true);
  };

  const handleDownloadPasswordSubmit = async (password: string) => {
    setIsSyncing(true);
    try {
      const result = await downloadAndSetupKeys(password);
      if (result.success) {
        toast.success(`Downloaded ${result.downloaded} keys from cloud`);
        await loadSettings();
      } else {
        toast.error(result.error || "Failed to download keys");
      }
    } catch (error) {
      console.error("[ApiKeySyncSettings] Download keys error:", error);
      toast.error("Failed to download keys");
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return "Never";

    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Secure API Key Sync
          </CardTitle>
          <CardDescription>
            Encrypt and sync your API keys across devices using password-based encryption
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* S3 Configuration Warning */}
          {!s3Configured && (
            <div className="flex gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  S3 sync not configured
                </p>
                <p className="text-blue-800 dark:text-blue-200 mt-1">
                  Configure S3 sync in the Data Sync section below to enable API key sync.
                </p>
              </div>
            </div>
          )}

          {/* Sync Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Secure Sync</Label>
              <p className="text-sm text-muted-foreground">
                {syncEnabled ? "Sync is enabled" : "Sync is disabled"}
              </p>
            </div>
            <Switch
              checked={syncEnabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  handleEnableSync();
                } else {
                  setShowDisableDialog(true);
                }
              }}
              disabled={!s3Configured}
            />
          </div>

          {/* Sync Details (when enabled) */}
          {syncEnabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* Password Hint */}
              {hint && (
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Password Hint</Label>
                  <p className="text-sm">{hint}</p>
                </div>
              )}

              {/* Last Sync */}
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Last Sync</Label>
                <p className="text-sm">{formatLastSync(lastSyncAt)}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="flex-1"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleChangePassword}
                  variant="outline"
                  disabled={isSyncing}
                >
                  <Key className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
              </div>

              {/* Danger Zone */}
              <div className="pt-4 border-t">
                <div className="space-y-2">
                  <Label className="text-destructive">Danger Zone</Label>
                  <p className="text-sm text-muted-foreground">
                    Disable sync and delete all encrypted keys from cloud storage
                  </p>
                  <Button
                    onClick={() => setShowDisableDialog(true)}
                    variant="destructive"
                    size="sm"
                  >
                    Disable Sync & Delete Remote Keys
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Download Keys Option (when sync is disabled but S3 is configured) */}
          {!syncEnabled && s3Configured && (
            <div className="pt-2 border-t">
              <div className="space-y-2">
                <Label>Setup from Another Device</Label>
                <p className="text-sm text-muted-foreground">
                  If you&apos;ve already enabled sync on another device, download your encrypted keys
                </p>
                <Button
                  onClick={handleDownloadKeys}
                  variant="outline"
                  size="sm"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Keys from Cloud
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Dialog */}
      <SyncPasswordDialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
        mode={passwordDialogMode}
        onSubmit={
          showDownloadDialog ? handleDownloadPasswordSubmit : handlePasswordSubmit
        }
        hint={hint}
      />

      {/* Disable Confirmation Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable API Key Sync?</AlertDialogTitle>
            <AlertDialogDescription>
              This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Disable API key sync on this device</li>
                <li>Delete your encrypted keys from cloud storage</li>
                <li>Keep your local API keys intact</li>
              </ul>
              <p className="mt-3 font-medium">
                You can re-enable sync later, but you&apos;ll need to set a new password.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableSync}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable & Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Download Confirmation Dialog */}
      <AlertDialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Download Encrypted Keys?</AlertDialogTitle>
            <AlertDialogDescription>
              This will download encrypted API keys from cloud storage and decrypt them with your sync password.
              <p className="mt-3 font-medium">
                You&apos;ll need the same password you used when setting up sync on your other device.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDownloadConfirm}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
