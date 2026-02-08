"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Key,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useLuminaStore } from "@/stores/lumina-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useModelsStore } from "@/stores/models-store";
import { useLuminaPreferencesStore, NotificationLevel } from "@/stores/lumina-preferences-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function ConnectionTab() {
  const { isConnected, isConnecting, error, connect, disconnect } = useLuminaStore();
  const { clawUrl, clawSecret, clawEnabled, updateClawSettings } = useSettingsStore();
  const notificationLevel = useLuminaPreferencesStore((s) => s.notificationLevel);
  const setNotificationLevel = useLuminaPreferencesStore((s) => s.setNotificationLevel);

  const [url, setUrl] = useState(clawUrl || "");
  const [secret, setSecret] = useState(clawSecret || "");
  const [enabled, setEnabled] = useState(clawEnabled ?? false);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    updateClawSettings(url, secret, checked);
  };

  const handleConnect = async () => {
    if (!url || !secret) {
      toast.error("URL and secret are required");
      return;
    }
    await connect(url, secret);
    const connected = useLuminaStore.getState().isConnected;
    if (connected) {
      const latestUrl = useSettingsStore.getState().clawUrl;
      if (latestUrl && latestUrl !== url) {
        setUrl(latestUrl);
      }
      setEnabled(true);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    updateClawSettings(url, secret, false);
    setEnabled(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardDescription>Connect to your Lumina CLI instance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="claw-enabled">Enable Lumina CLI</Label>
          <Switch id="claw-enabled" checked={enabled} onCheckedChange={handleToggle} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="claw-url">URL</Label>
          <Input
            id="claw-url"
            placeholder="http://100.x.x.x:8000"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="claw-secret">Secret</Label>
          <Input
            id="claw-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <Button variant="destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Connect
            </Button>
          )}

          {isConnected && (
            <Badge variant="default" className="bg-green-600 hover:bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
          {error && (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              {error}
            </Badge>
          )}
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="notification-level">Notification Level</Label>
          <Select
            value={notificationLevel}
            onValueChange={(value) => setNotificationLevel(value as NotificationLevel)}
          >
            <SelectTrigger id="notification-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All notifications</SelectItem>
              <SelectItem value="important">Important only (recommended)</SelectItem>
              <SelectItem value="minimal">Minimal (errors & attention)</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Control which Lumina CLI events show as notifications
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigTab() {
  const { config, updateConfig, isConnected } = useLuminaStore();
  const allModels = useModelsStore((s) => s.models);
  const [model, setModel] = useState(config?.openrouterModel ?? "");
  const [heartbeat, setHeartbeat] = useState(
    config?.heartbeatIntervalMinutes?.toString() ?? ""
  );

  useEffect(() => {
    if (config) {
      setModel(config.openrouterModel ?? "");
      setHeartbeat(config.heartbeatIntervalMinutes?.toString() ?? "");
    }
  }, [config]);

  const handleSave = async () => {
    try {
      await updateConfig({
        openrouterModel: model,
        heartbeatIntervalMinutes: Number(heartbeat),
      });
      toast.success("Config updated");
    } catch {
      toast.error("Failed to update config");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Config</CardTitle>
        <CardDescription>Edit Lumina CLI configuration</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>OpenRouter Model</Label>
          <Select value={model} onValueChange={setModel} disabled={!isConnected}>
            <SelectTrigger>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {allModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="claw-heartbeat">Heartbeat Interval (minutes)</Label>
          <Input
            id="claw-heartbeat"
            type="number"
            value={heartbeat}
            onChange={(e) => setHeartbeat(e.target.value)}
            disabled={!isConnected}
          />
        </div>
        <Button onClick={handleSave} disabled={!isConnected}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function KeySyncTab() {
  const { pushKeys, isConnected } = useLuminaStore();
  const { keys } = useApiKeysStore();
  const settings = useSettingsStore();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const keyMap: Record<string, string> = {};
      const providerToEnv: Record<string, string> = {
        openrouter: "OPENROUTER_API_KEY",
        mem0: "MEM0_API_KEY",
        composio: "COMPOSIO_API_KEY",
      };
      for (const k of keys) {
        const envName = providerToEnv[k.provider];
        if (envName) {
          keyMap[envName] = k.key;
        }
      }
      keyMap["MEM0_USER_ID"] = settings.memoryUserId || "default-user";
      if (Object.keys(keyMap).length === 0) {
        toast.error("No keys found to sync");
        setSyncing(false);
        return;
      }
      const updated = await pushKeys(keyMap);
      toast.success(`Synced ${updated.length} key(s) to Lumina CLI`);
    } catch {
      toast.error("Failed to sync keys");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Sync</CardTitle>
        <CardDescription>Sync API keys from Lumina to Lumina CLI</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleSync} disabled={!isConnected || syncing}>
          {syncing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Key className="h-4 w-4 mr-2" />
          Sync API Keys to Lumina CLI
        </Button>
      </CardContent>
    </Card>
  );
}

export function ClawSettings() {
  const { isConnected, refreshAll, initFromSettings } = useLuminaStore();

  useEffect(() => {
    if (!isConnected) {
      initFromSettings();
    }
  }, [isConnected, initFromSettings]);

  useEffect(() => {
    if (isConnected) {
      refreshAll();
    }
  }, [isConnected, refreshAll]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-medium">Lumina CLI Settings</h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Manage your Lumina CLI connection and configuration
        </p>
      </div>

      <Tabs defaultValue="connection">
        <TabsList className="flex overflow-x-auto gap-1 h-auto p-1 w-full scrollbar-none">
          <TabsTrigger value="connection" className="gap-1.5 text-xs shrink-0">
            <Bot className="h-3.5 w-3.5" />
            Connection
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 text-xs shrink-0">
            <Settings className="h-3.5 w-3.5" />
            Config
          </TabsTrigger>
          <TabsTrigger value="keysync" className="gap-1.5 text-xs shrink-0">
            <Key className="h-3.5 w-3.5" />
            Key Sync
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
          <ConnectionTab />
        </TabsContent>
        <TabsContent value="config">
          <ConfigTab />
        </TabsContent>
        <TabsContent value="keysync">
          <KeySyncTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
