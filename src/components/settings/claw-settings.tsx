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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Key,
  Plus,
  Trash2,
  Clock,
  Activity,
  ListTodo,
  Settings,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useClawStore } from "@/stores/claw-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useModelsStore } from "@/stores/models-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function ConnectionTab() {
  const { isConnected, isConnecting, error, connect, disconnect } = useClawStore();
  const { clawUrl, clawSecret, clawEnabled, updateClawSettings } = useSettingsStore();

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
    await updateClawSettings(url, secret, true);
    setEnabled(true);
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
        <CardDescription>Connect to your Claw agent instance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="claw-enabled">Enable Claw</Label>
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
      </CardContent>
    </Card>
  );
}

function TasksTab() {
  const { tasks, createTask, deleteTask, isConnected } = useClawStore();
  const [instruction, setInstruction] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-600",
    running: "bg-blue-500/20 text-blue-600",
    completed: "bg-green-500/20 text-green-600",
    failed: "bg-red-500/20 text-red-600",
  };

  const handleCreate = async () => {
    if (!instruction.trim()) return;
    try {
      await createTask(instruction.trim());
      setInstruction("");
      setDialogOpen(false);
      toast.success("Task created");
    } catch {
      toast.error("Failed to create task");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Manage Claw tasks</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!isConnected}>
              <Plus className="h-4 w-4 mr-1" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="Task instruction..."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate} className="w-full">
                Submit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={statusColor[task.status]}>
                      {task.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Priority: {task.priority}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteTask(task.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityTab() {
  const { activity } = useClawStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Recent Claw activity</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <div className="space-y-2">
            {activity.map((entry) => (
              <div key={entry.id} className="rounded-md border p-3 space-y-1">
                <p className="text-sm font-bold">{entry.action}</p>
                {entry.details && (
                  <p className="text-sm text-muted-foreground">{entry.details}</p>
                )}
                <p className="text-xs text-muted-foreground">{entry.timestamp}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SchedulesTab() {
  const { schedules, createSchedule, deleteSchedule, isConnected } = useClawStore();
  const [name, setName] = useState("");
  const [cron, setCron] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !cron.trim()) return;
    try {
      await createSchedule(name.trim(), cron.trim());
      setName("");
      setCron("");
      setDialogOpen(false);
      toast.success("Schedule created");
    } catch {
      toast.error("Failed to create schedule");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Schedules</CardTitle>
          <CardDescription>Manage Claw schedules</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!isConnected}>
              <Plus className="h-4 w-4 mr-1" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="Schedule name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                placeholder="Cron expression (e.g. 0 * * * *)"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
              />
              <Button onClick={handleCreate} className="w-full">
                Submit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules.</p>
        ) : (
          <div className="space-y-2">
            {schedules.map((sch) => (
              <div
                key={sch.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{sch.name}</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {sch.cronExpression}
                    </code>
                    <Badge variant={sch.enabled ? "default" : "secondary"}>
                      {sch.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteSchedule(sch.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigTab() {
  const { config, updateConfig, isConnected } = useClawStore();
  const allModels = useModelsStore((s) => s.models);
  const [model, setModel] = useState(config?.openrouterModel ?? "");
  const [heartbeat, setHeartbeat] = useState(
    config?.heartbeatIntervalMinutes?.toString() ?? ""
  );

  // Sync local state when config loads asynchronously
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
        <CardDescription>Edit Claw configuration</CardDescription>
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
  const { pushKeys, isConnected } = useClawStore();
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
      // Also push mem0 user ID from settings
      if (settings.memoryUserId) {
        keyMap["MEM0_USER_ID"] = settings.memoryUserId;
      }
      if (Object.keys(keyMap).length === 0) {
        toast.error("No keys found to sync");
        setSyncing(false);
        return;
      }
      const updated = await pushKeys(keyMap);
      toast.success(`Synced ${updated.length} key(s) to Claw`);
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
        <CardDescription>Sync API keys from Lumina to Claw</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleSync} disabled={!isConnected || syncing}>
          {syncing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Key className="h-4 w-4 mr-2" />
          Sync API Keys to Claw
        </Button>
      </CardContent>
    </Card>
  );
}

export function ClawSettings() {

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-medium">Claw Settings</h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Manage your Claw agent connection, tasks, and configuration
        </p>
      </div>

      <Tabs defaultValue="connection">
        <TabsList className="flex overflow-x-auto gap-1 h-auto p-1 w-full scrollbar-none">
          <TabsTrigger value="connection" className="gap-1.5 text-xs shrink-0">
            <Bot className="h-3.5 w-3.5" />
            Connection
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5 text-xs shrink-0">
            <ListTodo className="h-3.5 w-3.5" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 text-xs shrink-0">
            <Activity className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5 text-xs shrink-0">
            <Calendar className="h-3.5 w-3.5" />
            Schedules
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
        <TabsContent value="tasks">
          <TasksTab />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulesTab />
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
