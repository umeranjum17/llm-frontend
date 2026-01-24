"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCloudSync } from "@/hooks/use-cloud-sync";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Upload,
  Download,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  Settings2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SYNC_INTERVALS = [
  { value: "15", label: "Every 15 seconds" },
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every minute" },
  { value: "300", label: "Every 5 minutes" },
];

export function CloudSyncSettings() {
  const {
    config,
    isConfigured,
    isLoading,
    status,
    error,
    isSyncing,
    syncProgress,
    lastSyncInfo,
    saveConfig,
    deleteConfig,
    testConnection,
    configureCors,
    setEnabled,
    setAutoSync,
    syncNow,
    forceUpload,
    forceDownload,
    setPassword,
    hasPassword,
    clearPassword,
  } = useCloudSync();

  // Form state
  const [provider, setProvider] = useState<"r2" | "s3">("r2");
  const [endpoint, setEndpoint] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState("30");
  const [deviceName, setDeviceName] = useState("");

  // Password dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPasswordInput] = useState("");

  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Testing state
  const [isTesting, setIsTesting] = useState(false);
  const [isConfiguringCors, setIsConfiguringCors] = useState(false);

  // Load existing config into form
  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setEndpoint(config.endpoint || "");
      setBucket(config.bucket);
      setRegion(config.region || "us-east-1");
      setEncryptionEnabled(config.encryptionEnabled);
      setSyncInterval(String(config.syncIntervalSeconds));
      setDeviceName(config.deviceName || "");
      // Don't load credentials into form for security
    }
  }, [config]);

  const handleSaveConfig = async () => {
    if (!bucket) {
      toast.error("Please enter a bucket name");
      return;
    }

    if (!accessKeyId || !secretAccessKey) {
      toast.error("Please enter your access credentials");
      return;
    }

    if (provider === "r2" && !endpoint) {
      toast.error("Please enter your R2 endpoint URL");
      return;
    }

    await saveConfig({
      provider,
      bucket,
      region: provider === "s3" ? region : undefined,
      endpoint: endpoint || undefined,
      accessKeyId,
      secretAccessKey,
      encryptionEnabled,
      syncIntervalSeconds: parseInt(syncInterval),
      deviceName: deviceName || undefined,
    });

    // Clear sensitive fields after save
    setAccessKeyId("");
    setSecretAccessKey("");

    toast.success("Cloud sync configured");
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    const result = await testConnection();
    setIsTesting(false);

    if (result.success) {
      toast.success("Connection successful");
    } else {
      toast.error("Connection failed", { description: result.error });
    }
  };

  const handleConfigureCors = async () => {
    setIsConfiguringCors(true);
    const result = await configureCors();
    setIsConfiguringCors(false);
  };

  const handleSync = async () => {
    if (config?.encryptionEnabled && !hasPassword()) {
      setShowPasswordDialog(true);
      return;
    }
    await syncNow();
  };

  const handleForceUpload = async () => {
    if (config?.encryptionEnabled && !hasPassword()) {
      setShowPasswordDialog(true);
      return;
    }
    await forceUpload();
  };

  const handleForceDownload = async () => {
    if (config?.encryptionEnabled && !hasPassword()) {
      setShowPasswordDialog(true);
      return;
    }
    await forceDownload();
  };

  const handleSetPassword = () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPassword(password);
    setShowPasswordDialog(false);
    setPasswordInput("");
    toast.success("Encryption password set for this session");
  };

  const handleDelete = async () => {
    await deleteConfig();
    setShowDeleteDialog(false);
  };

  const syncInfo = lastSyncInfo();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Cloud Sync</h3>
        <p className="text-sm text-muted-foreground">
          Sync your data to your own cloud storage (S3/Cloudflare R2)
        </p>
      </div>

      {/* Status Card */}
      {isConfigured && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {status === "connected" && (
                  <Cloud className="h-5 w-5 text-green-500" />
                )}
                {status === "syncing" && (
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                )}
                {status === "error" && (
                  <CloudOff className="h-5 w-5 text-red-500" />
                )}
                {status === "disconnected" && (
                  <CloudOff className="h-5 w-5 text-muted-foreground" />
                )}
                <CardTitle className="text-base">
                  {config?.enabled ? "Cloud Sync Active" : "Cloud Sync Disabled"}
                </CardTitle>
              </div>
              <Switch
                checked={config?.enabled ?? false}
                onCheckedChange={setEnabled}
              />
            </div>
            {syncInfo.synced && (
              <CardDescription>
                {syncInfo.message}
                {syncInfo.relativeTime && ` • ${syncInfo.relativeTime}`}
              </CardDescription>
            )}
            {!syncInfo.synced && (
              <CardDescription className="text-amber-600">
                {syncInfo.message}
              </CardDescription>
            )}
          </CardHeader>
          {config?.enabled && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleForceUpload}
                  disabled={isSyncing}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Force Upload
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleForceDownload}
                  disabled={isSyncing}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Force Download
                </Button>
              </div>

              {/* Sync Progress */}
              {syncProgress && (
                <div className="mt-3 text-sm text-muted-foreground">
                  {syncProgress.message}
                  {syncProgress.percentage !== undefined && (
                    <span className="ml-1">({syncProgress.percentage}%)</span>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            {isConfigured ? "Update Configuration" : "Configure Cloud Sync"}
          </CardTitle>
          <CardDescription>
            Connect to your own S3-compatible storage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Storage Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as "r2" | "s3")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="r2">
                  Cloudflare R2 (Recommended)
                </SelectItem>
                <SelectItem value="s3">AWS S3</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {provider === "r2" ? (
                <>
                  R2 offers generous free tier and no egress fees.{" "}
                  <a
                    href="https://dash.cloudflare.com/?to=/:account/r2/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline inline-flex items-center gap-1"
                  >
                    Create R2 bucket <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <>
                  Standard S3 pricing applies.{" "}
                  <a
                    href="https://console.aws.amazon.com/s3"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline inline-flex items-center gap-1"
                  >
                    Create S3 bucket <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </p>
          </div>

          {/* R2 Endpoint */}
          {provider === "r2" && (
            <div className="space-y-2">
              <Label htmlFor="endpoint">R2 Endpoint URL</Label>
              <Input
                id="endpoint"
                placeholder="https://<account-id>.r2.cloudflarestorage.com"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Find this in your R2 bucket settings under &quot;S3 API&quot;
              </p>
            </div>
          )}

          {/* S3 Region */}
          {provider === "s3" && (
            <div className="space-y-2">
              <Label htmlFor="region">AWS Region</Label>
              <Input
                id="region"
                placeholder="us-east-1"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>
          )}

          {/* Bucket Name */}
          <div className="space-y-2">
            <Label htmlFor="bucket">Bucket Name</Label>
            <Input
              id="bucket"
              placeholder="my-lumina-backup"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
            />
          </div>

          {/* Access Key ID */}
          <div className="space-y-2">
            <Label htmlFor="accessKeyId">Access Key ID</Label>
            <div className="relative">
              <Input
                id="accessKeyId"
                type={showAccessKey ? "text" : "password"}
                placeholder={isConfigured ? "••••••••" : "Enter access key"}
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowAccessKey(!showAccessKey)}
              >
                {showAccessKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Secret Access Key */}
          <div className="space-y-2">
            <Label htmlFor="secretAccessKey">Secret Access Key</Label>
            <div className="relative">
              <Input
                id="secretAccessKey"
                type={showSecretKey ? "text" : "password"}
                placeholder={isConfigured ? "••••••••" : "Enter secret key"}
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowSecretKey(!showSecretKey)}
              >
                {showSecretKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Device Name */}
          <div className="space-y-2">
            <Label htmlFor="deviceName">Device Name (Optional)</Label>
            <Input
              id="deviceName"
              placeholder="My MacBook"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Helps identify which device synced last
            </p>
          </div>

          {/* Auto Sync Interval */}
          {isConfigured && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Auto Sync</Label>
                <Switch
                  checked={config?.autoSyncEnabled ?? true}
                  onCheckedChange={setAutoSync}
                />
              </div>
              {config?.autoSyncEnabled && (
                <Select
                  value={syncInterval}
                  onValueChange={async (v) => {
                    setSyncInterval(v);
                    await saveConfig({ syncIntervalSeconds: parseInt(v) });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_INTERVALS.map((interval) => (
                      <SelectItem key={interval.value} value={interval.value}>
                        {interval.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Encryption */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                <Label>Encrypt Data</Label>
              </div>
              <Switch
                checked={encryptionEnabled}
                onCheckedChange={setEncryptionEnabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Encrypt your data with a password before uploading
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSaveConfig}>
              <Check className="h-4 w-4 mr-2" />
              {isConfigured ? "Update" : "Save"}
            </Button>

            {isConfigured && (
              <>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>

                <Button
                  variant="outline"
                  onClick={handleConfigureCors}
                  disabled={isConfiguringCors}
                >
                  {isConfiguringCors ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Settings2 className="h-4 w-4 mr-2" />
                  )}
                  Fix CORS
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Encryption Password</DialogTitle>
            <DialogDescription>
              Your sync data is encrypted. Enter your password to proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sync-password">Password</Label>
              <Input
                id="sync-password"
                type="password"
                placeholder="Enter your sync password"
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSetPassword();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetPassword}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cloud Sync Configuration?</DialogTitle>
            <DialogDescription>
              This will remove your cloud sync settings. Your data in the cloud will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
