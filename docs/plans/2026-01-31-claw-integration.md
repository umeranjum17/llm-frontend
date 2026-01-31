# Claw Agent Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deeply integrate Claw (background AI agent) into Lumina as a first-class feature — not bolted-on, but native. Users interact with Claw through chat (@Claw agent), auto-detecting skills ("schedule a daily email check", "what's Claw doing?"), and a Settings > Claw management dashboard.

**Architecture:** Three integration layers:
1. **Claw Agent** — Built-in agent in the agent picker. When selected, messages route to Claw's `/chat` endpoint instead of OpenRouter. Appears in chat like any other agent.
2. **Claw Skills** — Three built-in auto-detect skills: "Delegate to Claw" (create tasks), "Schedule with Claw" (create cron jobs), "Claw Status" (inline status report). Work even when Claw isn't the active agent.
3. **Settings > Claw** — Full management dashboard with sub-tabs: Connection, Tasks, Activity, Schedules, Config, Key Sync.

All powered by a `ClawClient` HTTP class, `useClawStore` Zustand store, and SSE real-time events. Zero changes to existing chat/agent/skill infrastructure — all additive.

**Tech Stack:** Next.js 15, React 19, Zustand, Dexie (IndexedDB), Tailwind CSS, Shadcn UI, EventSource (SSE).

---

## Claw API Reference (backend already built)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | No | Health check, uptime |
| GET | `/tasks` | Yes | List all tasks |
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

## Task 1: Claw Types + API Client ✅ DONE

Already committed at `1d5b2b8`. Files:
- `src/lib/claw/types.ts` — ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawConfig
- `src/lib/claw/client.ts` — ClawClient class with all endpoint methods + SSE

---

## Task 2: Add Claw Fields to UserSettings (Schema v32)

**Files:**
- Modify: `src/lib/db/schema.ts` — add fields to UserSettings, bump DB_SCHEMA_VERSION to 32

**Step 1: Add fields to UserSettings interface**

In `src/lib/db/schema.ts`, add to `UserSettings` interface after the `lastMemoryDecayAt` field (around line 200):

```typescript
  // Claw agent integration
  clawUrl?: string;           // e.g. "http://100.x.x.x:8000" (Tailscale IP)
  clawSecret?: string;        // Bearer token matching Claw's CLAW_SECRET env var
  clawEnabled?: boolean;      // Master toggle for Claw integration
```

**Step 2: Bump DB_SCHEMA_VERSION**

Change `export const DB_SCHEMA_VERSION = 31;` → `export const DB_SCHEMA_VERSION = 32;`

No table-registry changes needed — these are just optional fields on the existing `settings` row.

**Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: add clawUrl/clawSecret/clawEnabled to UserSettings (schema v32)"
```

---

## Task 3: Claw Zustand Store + Settings Store Update

**Files:**
- Create: `src/stores/claw-store.ts`
- Modify: `src/stores/settings-store.ts` — add `updateClawSettings` action

**Step 1: Add to settings store interface and implementation**

In `src/stores/settings-store.ts`, add to `SettingsState` interface:

```typescript
  updateClawSettings: (url: string, secret: string, enabled: boolean) => Promise<void>;
```

Implementation:

```typescript
  updateClawSettings: async (url, secret, enabled) => {
    await updateSettings({ clawUrl: url, clawSecret: secret, clawEnabled: enabled });
    set({ clawUrl: url, clawSecret: secret, clawEnabled: enabled });
  },
```

**Step 2: Create the store**

```typescript
// src/stores/claw-store.ts
import { create } from "zustand";
import { ClawClient } from "@/lib/claw/client";
import type { ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawConfig } from "@/lib/claw/types";
import { getSettings, updateSettings } from "@/lib/db/queries";

interface ClawState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  client: ClawClient | null;

  status: ClawStatus | null;
  tasks: ClawTask[];
  activity: ClawActivity[];
  schedules: ClawSchedule[];
  config: ClawConfig | null;

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
  chatWithClaw: (message: string) => Promise<{ response: string; taskId: string }>;
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
      set({ isConnecting: false, isConnected: false, error: (e as Error).message });
    }
  },

  disconnect: () => {
    set({ isConnected: false, client: null, status: null, tasks: [], activity: [], schedules: [], config: null, error: null });
  },

  refreshAll: async () => {
    const s = get();
    await Promise.allSettled([s.refreshTasks(), s.refreshActivity(), s.refreshSchedules(), s.refreshConfig()]);
  },

  refreshTasks: async () => {
    const { client } = get();
    if (!client) return;
    try { const { tasks } = await client.getTasks(); set({ tasks }); }
    catch (e) { console.warn("[Claw] refresh tasks:", (e as Error).message); }
  },

  refreshActivity: async () => {
    const { client } = get();
    if (!client) return;
    try { const { activity } = await client.getActivity(50); set({ activity }); }
    catch (e) { console.warn("[Claw] refresh activity:", (e as Error).message); }
  },

  refreshSchedules: async () => {
    const { client } = get();
    if (!client) return;
    try { const { schedules } = await client.getSchedules(); set({ schedules }); }
    catch (e) { console.warn("[Claw] refresh schedules:", (e as Error).message); }
  },

  refreshConfig: async () => {
    const { client } = get();
    if (!client) return;
    try { const { config } = await client.getConfig(); set({ config }); }
    catch (e) { console.warn("[Claw] refresh config:", (e as Error).message); }
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

  chatWithClaw: async (message) => {
    const { client } = get();
    if (!client) throw new Error("Not connected to Claw");
    return client.chat(message);
  },

  initFromSettings: async () => {
    try {
      const settings = await getSettings();
      if (settings.clawEnabled && settings.clawUrl && settings.clawSecret) {
        await get().connect(settings.clawUrl, settings.clawSecret);
      }
    } catch { /* settings not loaded yet */ }
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

    es.onerror = () => console.warn("[Claw SSE] Connection error, auto-reconnecting...");

    return () => { es.close(); esRef.current = null; };
  }, [isConnected, client, refreshTasks, refreshActivity, refreshSchedules]);
}
```

**Step 2: Commit**

```bash
git add src/hooks/use-claw-events.ts
git commit -m "feat: add useClawEvents hook for real-time SSE updates from Claw"
```

---

## Task 5: Built-in Claw Agent

**Files:**
- Modify: `src/lib/constants/agents.ts` — add Claw agent to BUILTIN_AGENTS
- Modify: `src/hooks/use-chat.ts` — add special routing for Claw agent

**Step 1: Add Claw agent to BUILTIN_AGENTS**

In `src/lib/constants/agents.ts`, add to the `BUILTIN_AGENTS` array:

```typescript
{
  id: "agent_builtin_claw",
  name: "Claw",
  description: "Your background AI agent. Claw runs 24/7 on your machine, handling tasks like checking emails, managing schedules, and executing background work. Messages sent here go directly to Claw over your local network.",
  avatar: "🦀",
  systemPrompt: "You are Claw, a background AI agent. The user is talking to you through Lumina.",
  modelId: undefined,
  enabledTools: [],
  mcpServerIds: [],
  knowledgeBaseIds: [],
  isBuiltIn: true,
  isActive: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  usageCount: 0,
  executionType: "simple" as const,
},
```

**Step 2: Add Claw agent routing in use-chat.ts**

In `src/hooks/use-chat.ts`, inside the `generateResponse` function (or `sendMessage`), add a check before the normal LLM call. Find where agent-based routing happens and add:

```typescript
// Special routing for Claw agent — messages go to Claw's /chat endpoint
if (agent?.id === "agent_builtin_claw") {
  const clawStore = (await import("@/stores/claw-store")).useClawStore.getState();
  if (!clawStore.isConnected) {
    // Save error message as assistant response
    const errorMsg = "Claw is not connected. Go to Settings > Claw to configure the connection.";
    await saveAssistantMessage(actualChatId, errorMsg, parentUserMessageId);
    return;
  }
  try {
    const { response, taskId } = await clawStore.chatWithClaw(cleanedMessage);
    const content = taskId
      ? `${response}\n\n*Task ID: ${taskId}*`
      : response;
    await saveAssistantMessage(actualChatId, content, parentUserMessageId);
  } catch (e) {
    await saveAssistantMessage(actualChatId, `Claw error: ${(e as Error).message}`, parentUserMessageId);
  }
  return;
}
```

Note: `saveAssistantMessage` is a placeholder — the implementer should use whatever pattern `use-chat.ts` uses to persist and display assistant messages (likely creating a Message in Dexie and updating the streaming store). The implementer must read the existing code to find the correct pattern.

**Step 3: Commit**

```bash
git add src/lib/constants/agents.ts src/hooks/use-chat.ts
git commit -m "feat: add built-in Claw agent with direct API routing"
```

---

## Task 6: Built-in Claw Skills (3 skills)

**Files:**
- Modify: `src/lib/constants/skills.ts` — add 3 Claw skills to BUILTIN_SKILLS

**Step 1: Add skills to BUILTIN_SKILLS**

In `src/lib/constants/skills.ts`, add these three skills to the `BUILTIN_SKILLS` array:

```typescript
// --- Claw Integration Skills ---

{
  id: "skill_builtin_claw_delegate",
  name: "Delegate to Claw",
  description: "send this to Claw, have Claw handle this, delegate to Claw, create a task for Claw, Claw should do this, ask Claw to do this, background task",
  category: "productivity",
  systemPrompt: `The user wants to delegate a task to Claw, their background AI agent.

Extract the task instruction from the user's message and output it in a claw-task code fence:

\`\`\`claw-task
Check my emails and summarize anything important from today
\`\`\`

Rules:
- Extract a clear, actionable instruction
- If the user's message IS the instruction, use it directly
- Don't add extra commentary — just the code fence with the instruction
- After the code fence, confirm: "Task sent to Claw."`,
  trigger: { type: "auto" },
  autoApplyQueries: [
    "send this to Claw",
    "have Claw handle this",
    "delegate to Claw",
    "create a task for Claw",
    "Claw should do this",
  ],
  exclusionQueries: [
    "what is Claw",
    "how does Claw work",
    "tell me about Claw",
  ],
  ui: {
    icon: "Send",
    color: "orange",
    activeLabel: "Delegating to Claw...",
  },
  isBuiltIn: true,
  isEnabled: true,
  usageCount: 0,
  createdAt: now(),
  updatedAt: now(),
},
{
  id: "skill_builtin_claw_schedule",
  name: "Schedule with Claw",
  description: "schedule a task with Claw, set up a recurring task, every day at 9am, cron job for Claw, remind me daily via Claw, schedule Claw to check",
  category: "productivity",
  systemPrompt: `The user wants to create a scheduled/recurring task for Claw, their background AI agent.

Extract the schedule name and cron expression from the user's message and output in a claw-schedule code fence:

\`\`\`claw-schedule
{"name": "Check emails", "cron": "0 9 * * *"}
\`\`\`

Common cron patterns:
- Every day at 9am: "0 9 * * *"
- Every hour: "0 * * * *"
- Every Monday at 8am: "0 8 * * 1"
- Every 30 minutes: "*/30 * * * *"
- Twice daily (9am and 5pm): "0 9,17 * * *"

Rules:
- Extract a descriptive name and valid cron expression
- Use 5-field cron format (minute hour day-of-month month day-of-week)
- After the code fence, confirm: "Schedule created in Claw."`,
  trigger: { type: "auto" },
  autoApplyQueries: [
    "schedule a task with Claw",
    "set up a recurring task",
    "every day at 9am check",
    "cron job for Claw",
    "schedule Claw to",
  ],
  exclusionQueries: [
    "what are Claw's schedules",
    "show my schedules",
    "explain cron syntax",
  ],
  ui: {
    icon: "Calendar",
    color: "purple",
    activeLabel: "Scheduling with Claw...",
  },
  isBuiltIn: true,
  isEnabled: true,
  usageCount: 0,
  createdAt: now(),
  updatedAt: now(),
},
{
  id: "skill_builtin_claw_status",
  name: "Claw Status",
  description: "what's Claw doing, Claw status, show my Claw tasks, Claw activity, is Claw running, check on Claw, Claw tasks",
  category: "productivity",
  systemPrompt: `The user wants to check on Claw, their background AI agent.

You will receive Claw's current status data injected into the conversation context. Present it in a clean, readable format:

## Claw Status

**Connection:** 🟢 Online (uptime: Xh Ym)

### Active Tasks
| Task | Status | Created |
|------|--------|---------|
| ... | ... | ... |

### Recent Activity
- [timestamp] action — details
- ...

If no tasks or activity, say so. Be concise.`,
  trigger: { type: "auto" },
  autoApplyQueries: [
    "what's Claw doing",
    "Claw status",
    "show my Claw tasks",
    "is Claw running",
    "check on Claw",
  ],
  exclusionQueries: [
    "create a task for Claw",
    "send this to Claw",
    "schedule with Claw",
  ],
  ui: {
    icon: "Activity",
    color: "green",
    activeLabel: "Checking Claw status...",
  },
  isBuiltIn: true,
  isEnabled: true,
  usageCount: 0,
  createdAt: now(),
  updatedAt: now(),
},
```

**Step 2: Add claw-task and claw-schedule code fence parsing**

In the chat message handling code (likely in `use-chat.ts` after receiving LLM response, or in a message post-processor), add parsing for the special code fences:

```typescript
// After LLM response is received, check for Claw code fences
const clawTaskMatch = responseText.match(/```claw-task\n([\s\S]*?)```/);
if (clawTaskMatch) {
  const instruction = clawTaskMatch[1].trim();
  const clawStore = (await import("@/stores/claw-store")).useClawStore.getState();
  if (clawStore.isConnected) {
    try {
      await clawStore.createTask(instruction);
    } catch (e) {
      console.warn("[Claw] Failed to create task:", e);
    }
  }
}

const clawScheduleMatch = responseText.match(/```claw-schedule\n([\s\S]*?)```/);
if (clawScheduleMatch) {
  try {
    const { name, cron } = JSON.parse(clawScheduleMatch[1].trim());
    const clawStore = (await import("@/stores/claw-store")).useClawStore.getState();
    if (clawStore.isConnected) {
      await clawStore.createSchedule(name, cron);
    }
  } catch (e) {
    console.warn("[Claw] Failed to create schedule:", e);
  }
}
```

**Step 3: Add Claw status data injection for the Status skill**

In `src/lib/ai/context-builder.ts`, when the active skill is `skill_builtin_claw_status`, inject Claw's current data into the context:

```typescript
if (options?.skill?.id === "skill_builtin_claw_status") {
  const clawStore = (await import("@/stores/claw-store")).useClawStore.getState();
  if (clawStore.isConnected) {
    const statusData = {
      status: clawStore.status,
      tasks: clawStore.tasks,
      activity: clawStore.activity.slice(0, 10),
      schedules: clawStore.schedules,
    };
    skillContent += `\n\n## Current Claw Data\n\`\`\`json\n${JSON.stringify(statusData, null, 2)}\n\`\`\``;
  } else {
    skillContent += "\n\nClaw is not connected. Tell the user to configure it in Settings > Claw.";
  }
}
```

**Step 4: Commit**

```bash
git add src/lib/constants/skills.ts src/hooks/use-chat.ts src/lib/ai/context-builder.ts
git commit -m "feat: add 3 built-in Claw skills (delegate, schedule, status) with code fence parsing"
```

---

## Task 7: Settings > Claw — Connection Tab

**Files:**
- Create: `src/components/settings/claw-settings.tsx`
- Modify: `src/app/settings/page.tsx` — add "Claw" tab

**Step 1: Create the settings component with Connection sub-tab**

Create `src/components/settings/claw-settings.tsx` — a component with an inner tab system:

- **Connection sub-tab**: URL input, secret input, enable toggle, connect/disconnect button with status badge, key sync button
- Reuses: Card, CardHeader, CardContent, Button, Input, Label, Switch, Badge from Shadcn
- Uses: `useClawStore` for connection state, `useSettingsStore` for persistence, `useApiKeysStore` for key sync, `toast` from sonner

See full implementation in the previous version of this plan (Task 5 in the old plan). The component should include connection config, test button, and key sync section.

**Step 2: Add "Claw" tab to settings page**

In `src/app/settings/page.tsx`:
1. Add dynamic import for `ClawSettings`
2. Add `"claw"` to `allowedTabs` array
3. Add `<TabsTrigger value="claw">` with `Bot` icon
4. Add `<TabsContent value="claw"><ClawSettings /></TabsContent>`

**Step 3: Commit**

```bash
git add src/components/settings/claw-settings.tsx src/app/settings/page.tsx
git commit -m "feat: add Settings > Claw connection tab"
```

---

## Task 8: Settings > Claw — Tasks, Activity, Schedules Sub-tabs

**Files:**
- Modify: `src/components/settings/claw-settings.tsx` — add Tasks, Activity, Schedules, Config sub-tabs

**Step 1: Add inner tabs to the Claw settings component**

Using `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from Shadcn, add sub-tabs within the Claw settings:

**Tasks sub-tab:**
- Table view: id (truncated), title, status badge (pending=yellow, running=blue, completed=green, failed=red), priority, created date
- "New Task" button → Dialog with textarea for instruction
- Delete button per row
- Uses `useClawStore` tasks + createTask + deleteTask
- Auto-refresh from SSE (useClawEvents hook)

**Activity sub-tab:**
- Timeline/feed with entries: action (bold), details (muted), timestamp
- Limit selector dropdown (20, 50, 100) → refreshActivity with limit
- Uses `useClawStore` activity

**Schedules sub-tab:**
- Table: name, cron expression (code), enabled badge, last run, next run
- "New Schedule" button → Dialog with name + cron input
- Delete button per row
- Uses `useClawStore` schedules + createSchedule + deleteSchedule

**Config sub-tab:**
- Form fields: openrouterModel (input), heartbeatIntervalMinutes (number input)
- Save button → updateConfig
- Uses `useClawStore` config + updateConfig

**Key Sync sub-tab:**
- Shows which Lumina API keys can be synced to Claw
- "Sync Keys" button → pushKeys
- Shows masked key status from `getMaskedKeys`

**Step 2: Commit**

```bash
git add src/components/settings/claw-settings.tsx
git commit -m "feat: add Tasks, Activity, Schedules, Config, Key Sync sub-tabs to Claw settings"
```

---

## Task 9: Auto-Connect on Startup + SSE Activation

**Files:**
- Modify: `src/app/page.tsx` — call `initFromSettings()` on mount
- Modify: `src/components/settings/claw-settings.tsx` — activate `useClawEvents` when on Claw settings page

**Step 1: Add auto-connect on startup**

In `src/app/page.tsx`, add after the existing initialization effects:

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

**Step 2: Activate SSE in Claw settings**

In `src/components/settings/claw-settings.tsx`, call `useClawEvents()` at the top of the component so SSE is active while viewing Claw settings (keeps data fresh).

**Step 3: Commit**

```bash
git add src/app/page.tsx src/components/settings/claw-settings.tsx
git commit -m "feat: auto-connect to Claw on startup and activate SSE on settings page"
```

---

## Task 10: Type Check + Build

**Step 1: Type check**

Run: `cd /home/umer/Github/llm-frontend && npx tsc --noEmit`
Expected: No type errors.

**Step 2: Build**

Run: `cd /home/umer/Github/llm-frontend && npm run build`
Expected: Build succeeds.

**Step 3: Fix any issues and commit**

```bash
git add -A && git commit -m "chore: fix type errors and build issues from Claw integration"
```

---

## Summary of All Changes

### New Files (4)
| File | Purpose |
|------|---------|
| `src/lib/claw/types.ts` | TypeScript types for Claw API |
| `src/lib/claw/client.ts` | HTTP client for all Claw endpoints + SSE |
| `src/stores/claw-store.ts` | Zustand store (connection, data, actions, chat) |
| `src/hooks/use-claw-events.ts` | SSE subscription hook |

### New Components (1)
| File | Purpose |
|------|---------|
| `src/components/settings/claw-settings.tsx` | Full Claw management dashboard (Connection, Tasks, Activity, Schedules, Config, Key Sync) |

### Modified Files (6)
| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `clawUrl`, `clawSecret`, `clawEnabled` to UserSettings; bump to v32 |
| `src/stores/settings-store.ts` | Add `updateClawSettings` action |
| `src/lib/constants/agents.ts` | Add built-in Claw agent |
| `src/lib/constants/skills.ts` | Add 3 Claw skills (delegate, schedule, status) |
| `src/hooks/use-chat.ts` | Claw agent routing + code fence parsing |
| `src/lib/ai/context-builder.ts` | Inject Claw status data for status skill |
| `src/app/settings/page.tsx` | Add "Claw" tab |
| `src/app/page.tsx` | Auto-connect on startup |

### Zero Breaking Changes
- All existing features untouched
- Claw agent is a standard built-in agent (same pattern as Research Assistant, etc.)
- Claw skills are standard built-in skills (same pattern as Summarize, Create Chart, etc.)
- DB migration is additive (optional fields on existing `settings` row)
- Claw features only activate when `clawEnabled` is true and connected
