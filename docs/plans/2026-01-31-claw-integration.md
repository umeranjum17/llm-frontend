# Claw Agent Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Claw" panel to Lumina that connects to Claw's REST API (over Tailscale), showing agent status, tasks, activity, schedules — and allowing task creation and API key sync — while keeping all existing Lumina functionality intact.

**Architecture:** Claw is a background AI agent with a Hono REST API at `http://<tailscale-ip>:8000`. Lumina connects via a new `ClawClient` class, stores connection config in `UserSettings`, manages state in a Zustand store, and renders a collapsible panel at the bottom of the sidebar. SSE provides real-time updates. All changes are additive — zero modifications to existing chat/agent/skill flows.

**Tech Stack:** Next.js 15, React 19, Zustand, Dexie (IndexedDB), Tailwind CSS, Shadcn UI, EventSource (SSE).

---

## Claw API Reference (backend already built)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | No | Health check, uptime |
| GET | `/tasks` | Yes | List all tasks |
| GET | `/tasks/:id` | Yes | Get single task |
| POST | `/tasks` | Yes | Create task |
| PATCH | `/tasks/:id` | Yes | Update task |
| DELETE | `/tasks/:id` | Yes | Delete task |
| GET | `/activity` | Yes | Recent activity (`?limit=N`) |
| GET | `/schedules` | Yes | List schedules |
| POST | `/schedules` | Yes | Create schedule |
| DELETE | `/schedules/:id` | Yes | Delete schedule |
| GET | `/events` | Yes | SSE stream |
| GET | `/config` | Yes | Get safe config |
| PATCH | `/config` | Yes | Update config |
| GET | `/config/keys` | Yes | Get masked API keys |
| POST | `/config/keys` | Yes | Push API keys to Claw |
| POST | `/chat` | Yes | Chat with agent |

Auth: `Authorization: Bearer <CLAW_SECRET>` header (or `?token=<secret>` for SSE).

---

## Task 1: Claw Types + API Client

**Files:**
- Create: `src/lib/claw/types.ts`
- Create: `src/lib/claw/client.ts`

**Step 1: Create types file**

```typescript
// src/lib/claw/types.ts
export interface ClawStatus {
  status: string;
  uptime: number;
  startedAt: string;
}

export interface ClawTask {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "running" | "completed" | "failed";
  priority: "low" | "medium" | "high";
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  metadata?: string;
}

export interface ClawActivity {
  id: string;
  taskId?: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface ClawSchedule {
  id: string;
  name: string;
  cronExpression: string;
  taskId?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface ClawConfig {
  openrouterModel: string;
  heartbeatIntervalMinutes: number;
  port: number;
  host: string;
}
```

**Step 2: Create the API client**

```typescript
// src/lib/claw/client.ts
import type {
  ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawConfig,
} from "./types";

export class ClawClient {
  constructor(private baseUrl: string, private secret: string) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.secret}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Claw API error: ${res.status}`);
    }
    return res.json();
  }

  async getStatus(): Promise<ClawStatus> {
    return this.request("/status");
  }

  async getTasks(): Promise<{ tasks: ClawTask[] }> {
    return this.request("/tasks");
  }

  async getTask(id: string): Promise<{ task: ClawTask }> {
    return this.request(`/tasks/${id}`);
  }

  async createTask(instruction: string): Promise<{ accepted: boolean; taskId: string }> {
    return this.request("/tasks", {
      method: "POST",
      body: JSON.stringify({ instruction }),
    });
  }

  async updateTask(id: string, data: Partial<ClawTask>): Promise<{ ok: boolean }> {
    return this.request(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTask(id: string): Promise<{ ok: boolean }> {
    return this.request(`/tasks/${id}`, { method: "DELETE" });
  }

  async getActivity(limit = 20): Promise<{ activity: ClawActivity[] }> {
    return this.request(`/activity?limit=${limit}`);
  }

  async getSchedules(): Promise<{ schedules: ClawSchedule[] }> {
    return this.request("/schedules");
  }

  async createSchedule(name: string, cronExpression: string): Promise<{ id: string }> {
    return this.request("/schedules", {
      method: "POST",
      body: JSON.stringify({ name, cronExpression }),
    });
  }

  async deleteSchedule(id: string): Promise<{ ok: boolean }> {
    return this.request(`/schedules/${id}`, { method: "DELETE" });
  }

  async getConfig(): Promise<{ config: ClawConfig }> {
    return this.request("/config");
  }

  async updateConfig(data: Partial<ClawConfig>): Promise<{ ok: boolean }> {
    return this.request("/config", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getMaskedKeys(): Promise<{ keys: Record<string, string | null> }> {
    return this.request("/config/keys");
  }

  async pushKeys(keys: Record<string, string>): Promise<{ updated: string[] }> {
    return this.request("/config/keys", {
      method: "POST",
      body: JSON.stringify({ keys }),
    });
  }

  async chat(message: string): Promise<{ response: string; taskId: string }> {
    return this.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message, source: "lumina" }),
    });
  }

  createEventSource(): EventSource {
    return new EventSource(
      `${this.baseUrl}/events?token=${encodeURIComponent(this.secret)}`
    );
  }
}
```

**Step 3: Commit**

```bash
git add src/lib/claw/types.ts src/lib/claw/client.ts
git commit -m "feat: add Claw API client and types for agent integration"
```

---

## Task 2: Add Claw Fields to UserSettings (Schema v32)

**Files:**
- Modify: `src/lib/db/schema.ts` — add fields to `UserSettings`, bump `DB_SCHEMA_VERSION` to 32
- No table-registry changes needed (no new tables or indexes — just new optional fields on `settings` row)

**Step 1: Add fields to UserSettings interface**

In `src/lib/db/schema.ts`, add these fields to the `UserSettings` interface, after the `memoryDecayDays` / `lastMemoryDecayAt` block (around line 200):

```typescript
  // Claw agent integration
  clawUrl?: string;           // e.g. "http://100.x.x.x:8000" (Tailscale IP)
  clawSecret?: string;        // Bearer token matching Claw's CLAW_SECRET env var
  clawEnabled?: boolean;      // Master toggle for Claw sidebar panel
```

**Step 2: Bump DB_SCHEMA_VERSION**

Change line 5 from:
```typescript
export const DB_SCHEMA_VERSION = 31;
```
to:
```typescript
export const DB_SCHEMA_VERSION = 32;
```

**Step 3: Verify app starts**

Run: `cd /home/umer/Github/llm-frontend && npm run dev`
Expected: App starts, no DB errors. The version loop in the `LuminaDB` constructor (`for (let version = 1; version <= DB_SCHEMA_VERSION; version++)`) handles this automatically since `getStoresForVersion(32)` returns the same stores as v31 (no new tables).

**Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: add clawUrl/clawSecret/clawEnabled to UserSettings (schema v32)"
```

---

## Task 3: Claw Zustand Store

**Files:**
- Create: `src/stores/claw-store.ts`
- Modify: `src/stores/settings-store.ts` — add `updateClawSettings` action

**Step 1: Add updateClawSettings to settings store**

In `src/stores/settings-store.ts`, add to the `SettingsState` interface:

```typescript
  updateClawSettings: (url: string, secret: string, enabled: boolean) => Promise<void>;
```

And add the implementation inside `create<SettingsState>((set, get) => ({`:

```typescript
  updateClawSettings: async (url, secret, enabled) => {
    await updateSettings({ clawUrl: url, clawSecret: secret, clawEnabled: enabled });
    set({ clawUrl: url, clawSecret: secret, clawEnabled: enabled });
  },
```

**Step 2: Create the Claw store**

```typescript
// src/stores/claw-store.ts
import { create } from "zustand";
import { ClawClient } from "@/lib/claw/client";
import type {
  ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawConfig,
} from "@/lib/claw/types";
import { getSettings, updateSettings } from "@/lib/db/queries";

interface ClawState {
  // Connection
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  client: ClawClient | null;

  // Data
  status: ClawStatus | null;
  tasks: ClawTask[];
  activity: ClawActivity[];
  schedules: ClawSchedule[];
  config: ClawConfig | null;

  // Actions
  connect: (url: string, secret: string) => Promise<void>;
  disconnect: () => void;
  refreshAll: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  refreshSchedules: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  createTask: (instruction: string) => Promise<string | null>;
  deleteTask: (id: string) => Promise<void>;
  createSchedule: (name: string, cron: string) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  updateConfig: (data: Partial<ClawConfig>) => Promise<void>;
  pushKeys: (keys: Record<string, string>) => Promise<string[]>;
  initFromSettings: () => Promise<void>;
}

export const useClawStore = create<ClawState>((set, get) => ({
  isConnected: false,
  isConnecting: false,
  error: null,
  client: null,
  status: null,
  tasks: [],
  activity: [],
  schedules: [],
  config: null,

  connect: async (url, secret) => {
    set({ isConnecting: true, error: null });
    try {
      const client = new ClawClient(url, secret);
      const status = await client.getStatus();
      set({ client, isConnected: true, isConnecting: false, status });
      await updateSettings({ clawUrl: url, clawSecret: secret, clawEnabled: true });
      await get().refreshAll();
    } catch (e) {
      set({
        isConnecting: false,
        isConnected: false,
        error: (e as Error).message,
      });
    }
  },

  disconnect: () => {
    set({
      isConnected: false,
      client: null,
      status: null,
      tasks: [],
      activity: [],
      schedules: [],
      config: null,
      error: null,
    });
  },

  refreshAll: async () => {
    const s = get();
    await Promise.allSettled([
      s.refreshTasks(),
      s.refreshActivity(),
      s.refreshSchedules(),
      s.refreshConfig(),
    ]);
  },

  refreshTasks: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const { tasks } = await client.getTasks();
      set({ tasks });
    } catch (e) {
      console.warn("[Claw] Failed to refresh tasks:", (e as Error).message);
    }
  },

  refreshActivity: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const { activity } = await client.getActivity(50);
      set({ activity });
    } catch (e) {
      console.warn("[Claw] Failed to refresh activity:", (e as Error).message);
    }
  },

  refreshSchedules: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const { schedules } = await client.getSchedules();
      set({ schedules });
    } catch (e) {
      console.warn("[Claw] Failed to refresh schedules:", (e as Error).message);
    }
  },

  refreshConfig: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const { config } = await client.getConfig();
      set({ config });
    } catch (e) {
      console.warn("[Claw] Failed to refresh config:", (e as Error).message);
    }
  },

  createTask: async (instruction) => {
    const { client } = get();
    if (!client) return null;
    const { taskId } = await client.createTask(instruction);
    await get().refreshTasks();
    return taskId;
  },

  deleteTask: async (id) => {
    const { client } = get();
    if (!client) return;
    await client.deleteTask(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  createSchedule: async (name, cron) => {
    const { client } = get();
    if (!client) return;
    await client.createSchedule(name, cron);
    await get().refreshSchedules();
  },

  deleteSchedule: async (id) => {
    const { client } = get();
    if (!client) return;
    await client.deleteSchedule(id);
    set((s) => ({ schedules: s.schedules.filter((sch) => sch.id !== id) }));
  },

  updateConfig: async (data) => {
    const { client } = get();
    if (!client) return;
    await client.updateConfig(data);
    await get().refreshConfig();
  },

  pushKeys: async (keys) => {
    const { client } = get();
    if (!client) return [];
    const { updated } = await client.pushKeys(keys);
    return updated;
  },

  initFromSettings: async () => {
    try {
      const settings = await getSettings();
      if (settings.clawEnabled && settings.clawUrl && settings.clawSecret) {
        await get().connect(settings.clawUrl, settings.clawSecret);
      }
    } catch {
      // Settings not loaded yet
    }
  },
}));
```

**Step 3: Commit**

```bash
git add src/stores/claw-store.ts src/stores/settings-store.ts
git commit -m "feat: add Claw Zustand store and settings update action"
```

---

## Task 4: SSE Real-Time Hook

**Files:**
- Create: `src/hooks/use-claw-events.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/use-claw-events.ts
import { useEffect, useRef } from "react";
import { useClawStore } from "@/stores/claw-store";

export function useClawEvents() {
  const client = useClawStore((s) => s.client);
  const isConnected = useClawStore((s) => s.isConnected);
  const refreshTasks = useClawStore((s) => s.refreshTasks);
  const refreshActivity = useClawStore((s) => s.refreshActivity);
  const refreshSchedules = useClawStore((s) => s.refreshSchedules);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isConnected || !client) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    const es = client.createEventSource();
    esRef.current = es;

    const onTask = () => refreshTasks();
    const onActivity = () => refreshActivity();
    const onSchedule = () => refreshSchedules();

    es.addEventListener("task:created", onTask);
    es.addEventListener("task:updated", onTask);
    es.addEventListener("task:deleted", onTask);
    es.addEventListener("activity:new", onActivity);
    es.addEventListener("schedule:created", onSchedule);
    es.addEventListener("schedule:deleted", onSchedule);

    es.onerror = () => {
      console.warn("[Claw SSE] Connection error, auto-reconnecting...");
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [isConnected, client, refreshTasks, refreshActivity, refreshSchedules]);
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-claw-events.ts
git commit -m "feat: add useClawEvents hook for real-time SSE updates from Claw"
```

---

## Task 5: Claw Settings Tab

**Files:**
- Create: `src/components/settings/claw-settings.tsx`
- Modify: `src/app/settings/page.tsx` — add "Claw" tab

**Step 1: Create the settings component**

```typescript
// src/components/settings/claw-settings.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bot, Loader2, CheckCircle2, XCircle, Key } from "lucide-react";
import { useClawStore } from "@/stores/claw-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { toast } from "sonner";

export function ClawSettings() {
  const settings = useSettingsStore();
  const {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    pushKeys,
    client,
  } = useClawStore();
  const { keys } = useApiKeysStore();

  const [url, setUrl] = useState(settings.clawUrl || "");
  const [secret, setSecret] = useState(settings.clawSecret || "");
  const [enabled, setEnabled] = useState(settings.clawEnabled ?? false);

  useEffect(() => {
    if (settings.isLoaded) {
      setUrl(settings.clawUrl || "");
      setSecret(settings.clawSecret || "");
      setEnabled(settings.clawEnabled ?? false);
    }
  }, [settings.isLoaded, settings.clawUrl, settings.clawSecret, settings.clawEnabled]);

  const handleConnect = async () => {
    if (!url || !secret) {
      toast.error("URL and secret are required");
      return;
    }
    await connect(url, secret);
    if (useClawStore.getState().isConnected) {
      toast.success("Connected to Claw");
    } else {
      const err = useClawStore.getState().error;
      if (err) toast.error(`Connection failed: ${err}`);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.info("Disconnected from Claw");
  };

  const handleSyncKeys = async () => {
    if (!client) return;
    const keysToSync: Record<string, string> = {};
    for (const k of keys) {
      if (k.provider === "openrouter" && k.key)
        keysToSync["OPENROUTER_API_KEY"] = k.key;
    }
    if (Object.keys(keysToSync).length === 0) {
      toast.warning("No API keys to sync");
      return;
    }
    try {
      const updated = await pushKeys(keysToSync);
      toast.success(`Synced ${updated.length} key(s) to Claw`);
    } catch (e) {
      toast.error(`Key sync failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Claw Agent Connection
          </CardTitle>
          <CardDescription>
            Connect to your Claw background agent running on your local network
            or via Tailscale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="claw-enabled">Enable Claw Integration</Label>
            <Switch
              id="claw-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="claw-url">Claw URL</Label>
                <Input
                  id="claw-url"
                  placeholder="http://100.x.x.x:8000"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="claw-secret">Claw Secret</Label>
                <Input
                  id="claw-secret"
                  type="password"
                  placeholder="Bearer token"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnect}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <>
                    {error && (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        {error}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      onClick={handleConnect}
                      disabled={isConnecting}
                    >
                      {isConnecting && (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      )}
                      Connect
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Sync API Keys to Claw
            </CardTitle>
            <CardDescription>
              Push your Lumina API keys (OpenRouter, etc.) to Claw so it can use
              the same providers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleSyncKeys}>
              Sync Keys to Claw
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 2: Add "Claw" tab to settings page**

In `src/app/settings/page.tsx`:

1. Add dynamic import alongside the other lazy imports (around line 35):

```typescript
const ClawSettings = dynamic(
  () =>
    import("@/components/settings/claw-settings").then((m) => ({
      default: m.ClawSettings,
    })),
  { loading: LoadingSpinner }
);
```

2. Add `"claw"` to the `allowedTabs` array on line 63:

```typescript
const allowedTabs = ["general", "mcp", "api-keys", "memory", "theme", "shortcuts", "data", "sync", "agents", "skills", "trust", "analytics", "aliases", "claw"];
```

3. Add the tab trigger inside `<TabsList>` (with the other triggers):

```tsx
<TabsTrigger value="claw">
  <Bot className="h-4 w-4 mr-1.5" />
  Claw
</TabsTrigger>
```

4. Add the tab content (with the other `<TabsContent>` blocks):

```tsx
<TabsContent value="claw">
  <ClawSettings />
</TabsContent>
```

Note: `Bot` icon is already imported from lucide-react on line 9.

**Step 3: Verify**

Run: `cd /home/umer/Github/llm-frontend && npm run dev`
Navigate to `/settings?tab=claw`. Expected: "Claw Agent Connection" card renders with URL/secret fields.

**Step 4: Commit**

```bash
git add src/components/settings/claw-settings.tsx src/app/settings/page.tsx
git commit -m "feat: add Claw settings tab with connection config and key sync"
```

---

## Task 6: Claw Sidebar Components

**Files:**
- Create: `src/components/claw/status-badge.tsx`
- Create: `src/components/claw/task-list.tsx`
- Create: `src/components/claw/activity-feed.tsx`
- Create: `src/components/claw/schedule-list.tsx`
- Create: `src/components/claw/create-task-dialog.tsx`
- Create: `src/components/claw/claw-panel.tsx`

**Step 1: Create StatusBadge**

```typescript
// src/components/claw/status-badge.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { useClawStore } from "@/stores/claw-store";
import { Circle } from "lucide-react";

export function ClawStatusBadge() {
  const isConnected = useClawStore((s) => s.isConnected);
  const status = useClawStore((s) => s.status);

  if (!isConnected) {
    return (
      <Badge variant="secondary" className="text-xs">
        <Circle className="h-2 w-2 mr-1 fill-muted-foreground text-muted-foreground" />
        Offline
      </Badge>
    );
  }

  const mins = status ? Math.floor(status.uptime / 60) : 0;
  const label =
    mins > 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m`
      : `${mins}m`;

  return (
    <Badge variant="default" className="text-xs bg-green-600">
      <Circle className="h-2 w-2 mr-1 fill-current" />
      Up {label}
    </Badge>
  );
}
```

**Step 2: Create TaskList**

```typescript
// src/components/claw/task-list.tsx
"use client";

import { useClawStore } from "@/stores/claw-store";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  running: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

export function ClawTaskList() {
  const tasks = useClawStore((s) => s.tasks);
  const deleteTask = useClawStore((s) => s.deleteTask);

  if (tasks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No tasks yet.</p>
    );
  }

  return (
    <ScrollArea className="max-h-[300px]">
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start justify-between gap-2 p-2 rounded-md border text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{task.title}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[task.status] || "bg-gray-400"}`}
                />
                <span className="text-xs text-muted-foreground capitalize">
                  {task.status}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => deleteTask(task.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

**Step 3: Create ActivityFeed**

```typescript
// src/components/claw/activity-feed.tsx
"use client";

import { useClawStore } from "@/stores/claw-store";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ClawActivityFeed() {
  const activity = useClawStore((s) => s.activity);

  if (activity.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        No recent activity.
      </p>
    );
  }

  return (
    <ScrollArea className="max-h-[200px]">
      <div className="space-y-1.5">
        {activity.slice(0, 20).map((a) => (
          <div
            key={a.id}
            className="text-xs py-1 border-b border-border/50 last:border-0"
          >
            <span className="font-medium">{a.action}</span>
            {a.details && (
              <span className="text-muted-foreground ml-1">
                — {a.details}
              </span>
            )}
            <div className="text-muted-foreground/60 text-[10px] mt-0.5">
              {new Date(a.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

**Step 4: Create ScheduleList**

```typescript
// src/components/claw/schedule-list.tsx
"use client";

import { useClawStore } from "@/stores/claw-store";
import { Button } from "@/components/ui/button";
import { Trash2, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ClawScheduleList() {
  const schedules = useClawStore((s) => s.schedules);
  const deleteSchedule = useClawStore((s) => s.deleteSchedule);

  if (schedules.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No schedules.</p>
    );
  }

  return (
    <ScrollArea className="max-h-[200px]">
      <div className="space-y-2">
        {schedules.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 p-2 rounded-md border text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{s.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <code className="text-xs text-muted-foreground">
                  {s.cronExpression}
                </code>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => deleteSchedule(s.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

**Step 5: Create CreateTaskDialog**

```typescript
// src/components/claw/create-task-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { useClawStore } from "@/stores/claw-store";
import { toast } from "sonner";

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const createTask = useClawStore((s) => s.createTask);

  const handleCreate = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    try {
      await createTask(instruction.trim());
      toast.success("Task sent to Claw");
      setInstruction("");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="h-3 w-3 mr-1" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Task to Claw</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            placeholder="e.g. Check my emails and summarize anything important"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button
            onClick={handleCreate}
            disabled={loading || !instruction.trim()}
          >
            {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 6: Create ClawPanel (main container)**

```typescript
// src/components/claw/claw-panel.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useClawStore } from "@/stores/claw-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ClawStatusBadge } from "./status-badge";
import { ClawTaskList } from "./task-list";
import { ClawActivityFeed } from "./activity-feed";
import { ClawScheduleList } from "./schedule-list";
import { CreateTaskDialog } from "./create-task-dialog";
import { useClawEvents } from "@/hooks/use-claw-events";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRight,
  ListTodo,
  Activity,
  Calendar,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ClawPanel() {
  const isConnected = useClawStore((s) => s.isConnected);
  const clawEnabled = useSettingsStore((s) => s.clawEnabled);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);

  // Subscribe to SSE events when connected
  useClawEvents();

  // Don't render anything if Claw is not enabled in settings
  if (!clawEnabled) return null;

  if (!isConnected) {
    return (
      <div className="px-3 py-4 border-t">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Claw Agent
          </span>
          <ClawStatusBadge />
        </div>
        <p className="text-xs text-muted-foreground">
          Not connected.{" "}
          <Link href="/settings?tab=claw" className="underline">
            Configure
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-t space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Claw Agent
        </span>
        <div className="flex items-center gap-1.5">
          <ClawStatusBadge />
          <Link href="/settings?tab=claw">
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <Settings className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>

      <CreateTaskDialog />

      <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium w-full hover:text-foreground text-muted-foreground">
          <ChevronRight
            className={`h-3 w-3 transition-transform ${tasksOpen ? "rotate-90" : ""}`}
          />
          <ListTodo className="h-3 w-3" />
          Tasks
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1">
          <ClawTaskList />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium w-full hover:text-foreground text-muted-foreground">
          <ChevronRight
            className={`h-3 w-3 transition-transform ${activityOpen ? "rotate-90" : ""}`}
          />
          <Activity className="h-3 w-3" />
          Activity
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1">
          <ClawActivityFeed />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={schedulesOpen} onOpenChange={setSchedulesOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium w-full hover:text-foreground text-muted-foreground">
          <ChevronRight
            className={`h-3 w-3 transition-transform ${schedulesOpen ? "rotate-90" : ""}`}
          />
          <Calendar className="h-3 w-3" />
          Schedules
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1">
          <ClawScheduleList />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
```

**Step 7: Commit**

```bash
git add src/components/claw/
git commit -m "feat: add Claw sidebar components (status, tasks, activity, schedules, task dialog)"
```

---

## Task 7: Wire ClawPanel into Sidebar + Auto-Connect on Startup

**Files:**
- Modify: `src/components/sidebar/sidebar.tsx` — render `<ClawPanel />` at bottom
- Modify: `src/app/page.tsx` — call `initFromSettings()` on mount

**Step 1: Add ClawPanel to sidebar**

In `src/components/sidebar/sidebar.tsx`:

1. Add import at top:
```typescript
import { ClawPanel } from "@/components/claw/claw-panel";
```

2. Replace the closing section of the return JSX. Currently the sidebar ends with:
```tsx
      {/* Chat List */}
      <div className="flex-1 min-h-0 overflow-hidden pt-2">
        <ChatList searchQuery={searchQuery} onChatSelect={onNavigate} currentProjectId={currentProjectId} />
      </div>
    </div>
```

Change to:
```tsx
      {/* Chat List */}
      <div className="flex-1 min-h-0 overflow-hidden pt-2">
        <ChatList searchQuery={searchQuery} onChatSelect={onNavigate} currentProjectId={currentProjectId} />
      </div>

      {/* Claw Agent Panel */}
      <ClawPanel />
    </div>
```

**Step 2: Add auto-connect on startup**

In `src/app/page.tsx`, add this effect after the existing `useEffect` blocks (e.g. after the `loadRecentChat` effect around line 115):

```typescript
  // Auto-connect to Claw if previously configured
  useEffect(() => {
    if (settingsLoaded) {
      import("@/stores/claw-store").then(({ useClawStore }) => {
        useClawStore.getState().initFromSettings();
      });
    }
  }, [settingsLoaded]);
```

Using dynamic import keeps the Claw store out of the critical path — it only loads when settings are ready.

**Step 3: Verify**

Run: `cd /home/umer/Github/llm-frontend && npm run dev`
Expected: Sidebar shows "Claw Agent" section at bottom (only if `clawEnabled` is true in settings). If not configured, nothing renders.

**Step 4: Commit**

```bash
git add src/components/sidebar/sidebar.tsx src/app/page.tsx
git commit -m "feat: wire Claw panel into sidebar and auto-connect on startup"
```

---

## Task 8: Type Check + Build

**Step 1: Type check**

Run: `cd /home/umer/Github/llm-frontend && npx tsc --noEmit`
Expected: No type errors in new files.

**Step 2: Build**

Run: `cd /home/umer/Github/llm-frontend && npm run build`
Expected: Build succeeds.

**Step 3: Fix any issues and commit**

```bash
git add -A && git commit -m "chore: fix type errors and build issues from Claw integration"
```

---

## Summary of All Changes

### New Files (11)
| File | Purpose |
|------|---------|
| `src/lib/claw/types.ts` | TypeScript types for Claw API |
| `src/lib/claw/client.ts` | HTTP client for all 15 Claw endpoints + SSE |
| `src/stores/claw-store.ts` | Zustand store (connection, tasks, activity, schedules) |
| `src/hooks/use-claw-events.ts` | SSE subscription hook |
| `src/components/settings/claw-settings.tsx` | Settings tab UI |
| `src/components/claw/claw-panel.tsx` | Main sidebar panel container |
| `src/components/claw/status-badge.tsx` | Green/red connection indicator |
| `src/components/claw/task-list.tsx` | Task cards with status + delete |
| `src/components/claw/activity-feed.tsx` | Activity timeline |
| `src/components/claw/schedule-list.tsx` | Cron schedule list with delete |
| `src/components/claw/create-task-dialog.tsx` | Dialog to send tasks to Claw |

### Modified Files (4)
| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `clawUrl`, `clawSecret`, `clawEnabled` to UserSettings; bump to v32 |
| `src/stores/settings-store.ts` | Add `updateClawSettings` action |
| `src/app/settings/page.tsx` | Add "Claw" tab |
| `src/components/sidebar/sidebar.tsx` | Render `<ClawPanel />` at bottom |
| `src/app/page.tsx` | Auto-connect to Claw on startup |

### Zero Breaking Changes
- All existing features untouched (chat, agents, skills, projects, etc.)
- ClawPanel returns `null` when `clawEnabled` is falsy — invisible by default
- DB migration is additive (optional fields on existing `settings` row)
- Claw store lazy-loaded via dynamic import on startup
