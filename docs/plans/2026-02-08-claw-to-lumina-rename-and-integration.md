# Claw → Lumina Rename + Integration Gaps

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename all "Claw" references to "Lumina" across the frontend, add missing approval/question UI panels, wire up remaining SSE events, and fix timeout issues.

**Architecture:** The frontend (`llm-frontend`) connects to the backend (`lumina-cli`) via HTTP + SSE. The backend was renamed from "Claw" to "Lumina" but the frontend still uses the old name everywhere. We'll rename files, imports, types, stores, routes, and DB fields — then add the missing UI for approvals and questions.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand, Dexie (IndexedDB), Shadcn/ui, Hono (backend)

---

## Task 1: Rename core library — `src/lib/claw/` → `src/lib/lumina/`

**Files:**
- Rename: `src/lib/claw/client.ts` → `src/lib/lumina/client.ts`
- Rename: `src/lib/claw/types.ts` → `src/lib/lumina/types.ts`

**Step 1: Rename directory and files**
```bash
cd /home/umer/Github/llm-frontend
mv src/lib/claw src/lib/lumina
```

**Step 2: Rename ClawClient → LuminaClient in client.ts**

In `src/lib/lumina/client.ts`:
- Rename `export class ClawClient` → `export class LuminaClient`
- Rename all type prefixes: `Claw*` → `Lumina*` (e.g. `ClawStatus` → `LuminaStatus`, `ClawTask` → `LuminaTask`, etc.)

**Step 3: Rename all types in types.ts**

In `src/lib/lumina/types.ts`, rename every exported type:
- `ClawStatus` → `LuminaStatus`
- `ClawTask` → `LuminaTask`
- `ClawActivity` → `LuminaActivity`
- `ClawSchedule` → `LuminaSchedule`
- `ClawScheduleRun` → `LuminaScheduleRun`
- `ClawInitiative` → `LuminaInitiative`
- `ClawConfig` → `LuminaConfig`
- `ClawBriefing` → `LuminaBriefing`
- `ClawMonitor` → `LuminaMonitor`
- `ClawPipelineRun` → `LuminaPipelineRun`
- `ClawProject` → `LuminaProject`
- `ClawTrace` → `LuminaTrace`
- `ClawToolCall` → `LuminaToolCall`
- `ClawStreamEvent` → `LuminaStreamEvent`
- `ClawControlCapability` → `LuminaControlCapability`
- `ClawControlCapabilitiesResponse` → `LuminaControlCapabilitiesResponse`
- `ClawControlExecuteResponse` → `LuminaControlExecuteResponse`
- `ClawSkillLocal` → `LuminaSkillLocal`
- `ClawSkillSearchResult` → `LuminaSkillSearchResult`
- `ClawHubCategory` → `LuminaHubCategory`
- `ClawSkillsAvailable` → `LuminaSkillsAvailable`
- `ClawSkillInstallResult` → `LuminaSkillInstallResult`
- `PendingQuestion` stays as-is (already generic)
- `CostData`, `ToolCallStats`, `Codebase`, `CodebaseStats`, `CodebaseFile`, `CodebaseSearchResult` stay as-is (already generic)

**Step 4: Fix all imports across the codebase**

Every file importing from `@/lib/claw/client` or `@/lib/claw/types` must update to `@/lib/lumina/client` and `@/lib/lumina/types`. Key files:
- `src/stores/claw-store.ts` (will be renamed later)
- `src/hooks/use-claw-events.ts`
- `src/hooks/use-chat.ts`
- `src/lib/ai/context-builder.ts`
- All `src/components/claw/*.tsx` files
- `src/components/settings/claw-settings.tsx`
- `src/components/sidebar/claw-*.tsx`
- `src/components/chat/claw-agent-enrichment.tsx`

**Step 5: Verify build compiles**
```bash
npx tsc --noEmit
```

**Step 6: Commit**
```bash
git add -A && git commit -m "refactor: rename lib/claw to lib/lumina with type renames"
```

---

## Task 2: Rename stores — `claw-store` → `lumina-store` etc.

**Files to rename:**
- `src/stores/claw-store.ts` → `src/stores/lumina-store.ts`
- `src/stores/claw-activity-store.ts` → `src/stores/lumina-activity-store.ts`
- `src/stores/claw-notification-store.ts` → `src/stores/lumina-notification-store.ts`
- `src/stores/claw-preferences-store.ts` → `src/stores/lumina-preferences-store.ts`
- `src/stores/claw-control-store.ts` → `src/stores/lumina-control-store.ts`
- `src/stores/__tests__/claw-notification-store.test.ts` → `src/stores/__tests__/lumina-notification-store.test.ts`

**Step 1: Rename files**
```bash
cd /home/umer/Github/llm-frontend/src/stores
mv claw-store.ts lumina-store.ts
mv claw-activity-store.ts lumina-activity-store.ts
mv claw-notification-store.ts lumina-notification-store.ts
mv claw-preferences-store.ts lumina-preferences-store.ts
mv claw-control-store.ts lumina-control-store.ts
mv __tests__/claw-notification-store.test.ts __tests__/lumina-notification-store.test.ts
```

**Step 2: Rename exported hooks inside each store**

In `lumina-store.ts`:
- `useClawStore` → `useLuminaStore`
- `chatWithClaw` → `chatWithLumina`
- Update all internal references

In `lumina-activity-store.ts`:
- `useClawActivityStore` → `useLuminaActivityStore`

In `lumina-notification-store.ts`:
- `useClawNotificationStore` → `useLuminaNotificationStore`

In `lumina-preferences-store.ts`:
- `useClawPreferencesStore` → `useLuminaPreferencesStore`

In `lumina-control-store.ts`:
- `useClawControlStore` → `useLuminaControlStore`

**Step 3: Update all imports referencing these stores**

Search for `from.*claw-store` and `from.*claw-activity-store` etc. across all `src/` files and update.

**Step 4: Verify build**
```bash
npx tsc --noEmit
```

**Step 5: Commit**
```bash
git add -A && git commit -m "refactor: rename claw stores to lumina stores"
```

---

## Task 3: Rename hooks — `use-claw-events.ts` → `use-lumina-events.ts` etc.

**Files to rename:**
- `src/hooks/use-claw-events.ts` → `src/hooks/use-lumina-events.ts`
- `src/hooks/use-claw-surface.ts` → `src/hooks/use-lumina-surface.ts`

**Step 1: Rename files**
```bash
mv src/hooks/use-claw-events.ts src/hooks/use-lumina-events.ts
mv src/hooks/use-claw-surface.ts src/hooks/use-lumina-surface.ts
```

**Step 2: Rename exported hooks**
- `useClawEvents` → `useLuminaEvents`
- `useClawSurface` → `useLuminaSurface`

**Step 3: Update imports in consuming files**

Key consumers:
- `src/components/providers/global-hooks.tsx`
- `src/app/claw/page.tsx` (will be renamed in Task 4)
- Any component using these hooks

**Step 4: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: rename claw hooks to lumina hooks"
```

---

## Task 4: Rename components — `src/components/claw/` → `src/components/lumina/`

**Step 1: Rename the directory**
```bash
mv src/components/claw src/components/lumina
```

**Step 2: Rename all component files inside**
```bash
cd src/components/lumina
for f in claw-*.tsx; do mv "$f" "${f/claw-/lumina-}"; done
```

Files become:
- `lumina-history.tsx`
- `lumina-initiatives-panel.tsx`
- `lumina-briefing-card.tsx`
- `lumina-live-feed.tsx`
- `lumina-emergency-stop.tsx`
- `lumina-action-required.tsx`
- `lumina-initiatives-tab.tsx`
- `lumina-tasks-tab.tsx`
- `lumina-schedules-tab.tsx`
- `lumina-traces-tab.tsx`
- `lumina-tool-calls-tab.tsx`
- `lumina-intelligence.tsx`
- `lumina-skills-tab.tsx`
- `lumina-config-tab.tsx`
- `lumina-control-tab.tsx`
- `lumina-system-overview.tsx`
- `lumina-workspaces-tab.tsx`

**Step 3: Rename exported component names inside each file**

Pattern: `ClawFoo` → `LuminaFoo` (e.g. `ClawTasksTab` → `LuminaTasksTab`)

**Step 4: Rename other claw-prefixed components**
```bash
mv src/components/claw-floating-notifications.tsx src/components/lumina-floating-notifications.tsx
mv src/components/chat/claw-agent-enrichment.tsx src/components/chat/lumina-agent-enrichment.tsx
mv src/components/settings/claw-settings.tsx src/components/settings/lumina-settings.tsx
```

**Step 5: Rename sidebar components**
```bash
cd src/components/sidebar
mv claw-sidebar-widget.tsx lumina-sidebar-widget.tsx
mv claw-status-indicator.tsx lumina-status-indicator.tsx
mv claw-sidebar-widget/ lumina-sidebar-widget/
cd lumina-sidebar-widget
mv claw-popover-content.tsx lumina-popover-content.tsx
mv claw-trigger.tsx lumina-trigger.tsx
mv claw-disabled-cta.tsx lumina-disabled-cta.tsx
```

**Step 6: Update all imports across codebase**

This is the largest step. Every file importing from `@/components/claw/` or referencing `Claw*` component names needs updating. Use project-wide find-and-replace.

**Step 7: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: rename claw components to lumina components"
```

---

## Task 5: Rename route — `/app/claw/` → `/app/lumina/` and proxy

**Files:**
- Rename: `src/app/claw/page.tsx` → `src/app/lumina/page.tsx`
- Rename: `src/app/api/claw/[...path]/route.ts` → `src/app/api/lumina/[...path]/route.ts`

**Step 1: Rename app route**
```bash
mv src/app/claw src/app/lumina
```

**Step 2: Rename API proxy route**
```bash
mv src/app/api/claw src/app/api/lumina
```

**Step 3: Update internal references**

In `src/app/lumina/page.tsx`: Update any component imports that changed in Task 4.

In `src/app/api/lumina/[...path]/route.ts`: Update header names:
- `x-claw-url` → `x-lumina-url`
- `x-claw-secret` → `x-lumina-secret`

In `src/lib/lumina/client.ts`: If the client sends custom headers through the proxy, update those too. Check the `request()` method.

**Step 4: Update all internal links/routes**

Search for `/claw` in navigation, links, and redirects:
- Sidebar links pointing to `/claw`
- Any `router.push("/claw")` calls
- Settings that reference the claw dashboard URL

**Step 5: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: rename /claw route to /lumina"
```

---

## Task 6: Rename DB fields + migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/queries.ts`

**Step 1: Bump DB_SCHEMA_VERSION to 34**

In `src/lib/db/schema.ts`, change:
```typescript
export const DB_SCHEMA_VERSION = 34;
```

**Step 2: Rename fields in UserSettings interface**

```typescript
// Old
clawUrl?: string;
clawSecret?: string;
clawEnabled?: boolean;

// New
luminaUrl?: string;
luminaSecret?: string;
luminaEnabled?: boolean;
```

**Step 3: Add migration for v34**

Add a Dexie upgrade handler that copies old field values:
```typescript
db.version(34).stores({/* same stores */}).upgrade(tx => {
  return tx.table("settings").toCollection().modify(setting => {
    if (setting.clawUrl) { setting.luminaUrl = setting.clawUrl; delete setting.clawUrl; }
    if (setting.clawSecret) { setting.luminaSecret = setting.clawSecret; delete setting.clawSecret; }
    if (setting.clawEnabled !== undefined) { setting.luminaEnabled = setting.clawEnabled; delete setting.clawEnabled; }
  });
});
```

**Step 4: Update all references to old field names**

Search for `clawUrl`, `clawSecret`, `clawEnabled` across `src/` and replace with `luminaUrl`, `luminaSecret`, `luminaEnabled`. Key files (~13 files):
- `src/stores/lumina-store.ts` (renamed in Task 2)
- `src/components/settings/lumina-settings.tsx`
- `src/components/sidebar/lumina-sidebar-widget.tsx`
- `src/components/sidebar/lumina-sidebar-widget/lumina-popover-content.tsx`
- `src/components/lumina/lumina-action-required.tsx`
- `src/components/lumina-floating-notifications.tsx`
- `src/components/chat/chat-shell.tsx`
- `src/components/chat/lumina-agent-enrichment.tsx`
- `src/lib/db/queries.ts`
- `src/stores/settings-store.ts`
- `src/app/api/lumina/[...path]/route.ts`

**Step 5: Update CLAW_SECRET references in comments/strings**

The backend env var is `LUMINA_SECRET`. Update any user-facing strings that say "CLAW_SECRET" to "LUMINA_SECRET".

**Step 6: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "refactor: rename clawUrl/Secret/Enabled to luminaUrl/Secret/Enabled with DB migration"
```

---

## Task 7: Add approval client methods

**Files:**
- Modify: `src/lib/lumina/client.ts`
- Modify: `src/lib/lumina/types.ts`

**Step 1: Add PendingApproval type to types.ts**

```typescript
export interface LuminaApproval {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  source: string;
  taskId: string;
  reason?: string;
  createdAt: number;
}
```

**Step 2: Add client methods to client.ts**

After the `emergencyStop()` method (~line 322), add:
```typescript
async getApprovals(): Promise<{ approvals: LuminaApproval[] }> {
  return this.request("/approvals");
}

async respondToApproval(id: string, approved: boolean): Promise<{ ok: boolean; approved: boolean }> {
  return this.request(`/approvals/${id}`, {
    method: "POST",
    body: JSON.stringify({ approved }),
  });
}
```

**Step 3: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "feat: add approval client methods to LuminaClient"
```

---

## Task 8: Add approval state to store + SSE events

**Files:**
- Modify: `src/stores/lumina-store.ts`
- Modify: `src/hooks/use-lumina-events.ts`

**Step 1: Add approvals state to store**

Add to state interface:
```typescript
approvals: LuminaApproval[];
```

Add methods:
```typescript
refreshApprovals: () => Promise<void>;
respondToApproval: (id: string, approved: boolean) => Promise<void>;
```

Implement:
```typescript
refreshApprovals: async () => {
  const client = get().client;
  if (!client) return;
  try {
    const { approvals } = await client.getApprovals();
    set({ approvals });
  } catch {}
},

respondToApproval: async (id: string, approved: boolean) => {
  const client = get().client;
  if (!client) return;
  try {
    await client.respondToApproval(id, approved);
    set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) }));
  } catch {}
},
```

Add `refreshApprovals` to the `refreshAll()` call.

**Step 2: Add SSE event listeners for approvals**

In `use-lumina-events.ts`, add:
```typescript
es.addEventListener("approval:requested", (e) => {
  const data = JSON.parse(e.data);
  store.refreshApprovals();
  addNotification({ title: "Approval Needed", message: `${data.toolName} requires approval`, type: "warning" });
});

es.addEventListener("approval:responded", () => {
  store.refreshApprovals();
});

es.addEventListener("approval:timeout", (e) => {
  const data = JSON.parse(e.data);
  store.refreshApprovals();
  addNotification({ title: "Approval Timed Out", message: `${data.toolName} approval expired`, type: "error" });
});
```

**Step 3: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "feat: add approval state, store methods, and SSE event handlers"
```

---

## Task 9: Add approvals panel to dashboard

**Files:**
- Create: `src/components/lumina/lumina-approvals-tab.tsx`
- Modify: `src/app/lumina/page.tsx`

**Step 1: Create the approvals tab component**

Create `src/components/lumina/lumina-approvals-tab.tsx`:
- List pending approvals with tool name, args summary, source, reason, and timestamp
- Approve/Deny buttons per approval
- Empty state when no pending approvals
- Auto-refresh on mount
- Badge with count in the tab trigger

Follow the same patterns as `lumina-tasks-tab.tsx` and `lumina-initiatives-tab.tsx`.

**Step 2: Add tab to dashboard page**

In `src/app/lumina/page.tsx`, add a new tab between "overview" and "tasks":
```tsx
<TabsTrigger value="approvals">
  Approvals
  {approvals.length > 0 && <Badge variant="destructive" className="ml-1">{approvals.length}</Badge>}
</TabsTrigger>
```

And in tab content:
```tsx
<TabsContent value="approvals">
  <LuminaApprovalsTab />
</TabsContent>
```

**Step 3: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "feat: add approvals tab to Lumina dashboard"
```

---

## Task 10: Add questions panel to dashboard

**Files:**
- Create: `src/components/lumina/lumina-questions-tab.tsx`
- Modify: `src/app/lumina/page.tsx`

**Step 1: Create the questions tab component**

The store already has `questions`, `refreshQuestions`, `answerQuestion`, `dismissQuestion`.

Create `src/components/lumina/lumina-questions-tab.tsx`:
- List pending questions with question text, context, schedule info, and timestamp
- Text input + "Answer" button per question
- "Dismiss" button per question
- Empty state when no pending questions
- Badge with count

**Step 2: Add tab to dashboard**

Add after the approvals tab:
```tsx
<TabsTrigger value="questions">
  Questions
  {questions.length > 0 && <Badge className="ml-1">{questions.length}</Badge>}
</TabsTrigger>
```

**Step 3: Wire up SSE events for questions**

In `use-lumina-events.ts`, add:
```typescript
es.addEventListener("question:pending", () => {
  store.refreshQuestions();
  addNotification({ title: "Question Pending", message: "Lumina needs your input", type: "info" });
});

es.addEventListener("question:answered", () => {
  store.refreshQuestions();
});

es.addEventListener("question:dismissed", () => {
  store.refreshQuestions();
});
```

**Step 4: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "feat: add questions tab to Lumina dashboard with SSE events"
```

---

## Task 11: Wire up remaining SSE events

**Files:**
- Modify: `src/hooks/use-lumina-events.ts`

**Missing events to add (backend emits but frontend doesn't subscribe):**

```typescript
// Coding agent events
es.addEventListener("coding_agent:started", (e) => {
  pushActivity("coding_agent:started", JSON.parse(e.data));
});
es.addEventListener("coding_agent:output", (e) => {
  pushActivity("coding_agent:output", JSON.parse(e.data));
});
es.addEventListener("coding_agent:completed", (e) => {
  pushActivity("coding_agent:completed", JSON.parse(e.data));
});

// Shell events
es.addEventListener("shell:started", (e) => {
  pushActivity("shell:started", JSON.parse(e.data));
});
es.addEventListener("shell:output", (e) => {
  pushActivity("shell:output", JSON.parse(e.data));
});
es.addEventListener("shell:completed", (e) => {
  pushActivity("shell:completed", JSON.parse(e.data));
});

// Watcher events
es.addEventListener("watcher:event", (e) => {
  pushActivity("watcher:event", JSON.parse(e.data));
});
es.addEventListener("watcher:dry_run", (e) => {
  pushActivity("watcher:dry_run", JSON.parse(e.data));
});
es.addEventListener("watcher:action", (e) => {
  pushActivity("watcher:action", JSON.parse(e.data));
  addNotification({ title: "Watcher Action", message: "File watcher triggered an action", type: "info" });
});
es.addEventListener("watchers:started", (e) => {
  pushActivity("watchers:started", JSON.parse(e.data));
});
es.addEventListener("watchers:stopped", (e) => {
  pushActivity("watchers:stopped", JSON.parse(e.data));
});

// Skill events
es.addEventListener("skill:proposed", (e) => {
  pushActivity("skill:proposed", JSON.parse(e.data));
});
es.addEventListener("skill:generated", (e) => {
  pushActivity("skill:generated", JSON.parse(e.data));
  addNotification({ title: "Skill Generated", message: "New skill available", type: "info" });
});

// Schedule auto-pause
es.addEventListener("schedule:auto_paused", (e) => {
  const data = JSON.parse(e.data);
  store.refreshSchedules();
  addNotification({ title: "Schedule Paused", message: `Schedule auto-paused`, type: "warning" });
});

// Emergency stop
es.addEventListener("emergency:stop", () => {
  addNotification({ title: "Emergency Stop", message: "All autonomous operations halted", type: "error" });
});

// Cost
es.addEventListener("cost:logged", () => {
  store.refreshCost();
});
```

Also add these to the `ACTIVITY_EVENTS` array so they appear in the live feed:
```
"coding_agent:started", "coding_agent:output", "coding_agent:completed",
"shell:started", "shell:output", "shell:completed",
"watcher:event", "watcher:action",
"skill:proposed", "skill:generated",
"schedule:auto_paused",
"emergency:stop",
```

**Step 2: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "feat: wire up remaining SSE events (coding agent, shell, watchers, skills, cost)"
```

---

## Task 12: Fix indexCodebase timeout

**Files:**
- Modify: `src/lib/lumina/client.ts`

**Step 1: Fix the timeout**

In `indexCodebase()` method (~line 374), add the timeout parameter:

```typescript
async indexCodebase(id: string, incremental = false): Promise<{ message: string; codebaseId: string }> {
  return this.request(`/codebases/${id}/index`, {
    method: "POST",
    body: JSON.stringify({ incremental }),
  }, CONTROL_TIMEOUT_MS);  // Was using default 8s, now uses 915s
}
```

Also check `searchCodebase()` and `searchAllCodebases()` — these may need `CHAT_TIMEOUT_MS` (120s) instead of default 8s since search can be slow on large codebases.

**Step 2: Verify build + commit**
```bash
npx tsc --noEmit
git add -A && git commit -m "fix: use appropriate timeouts for indexCodebase and search operations"
```

---

## Task 13: Final cleanup + string updates

**Files:**
- Various UI components

**Step 1: Update user-facing strings**

Search for remaining "Claw" or "claw" in user-facing strings (button labels, tooltips, descriptions, toast messages) and replace with "Lumina":
- "Connect to Claw" → "Connect to Lumina"
- "Claw Dashboard" → "Lumina Dashboard"
- "Claw Settings" → "Lumina Settings"
- "chatWithClaw" references in UI → "Chat with Lumina"
- "CLAW_SECRET" in help text → "LUMINA_SECRET"
- Sidebar label "Claw" → "Lumina"

**Step 2: Update sidebar navigation**

The sidebar link pointing to `/claw` should now point to `/lumina`.

**Step 3: Clean up old plan docs**

The old plan files reference "Claw" — leave them as historical docs (no rename needed).

**Step 4: Full build + test**
```bash
npx tsc --noEmit
npm run test:run
npm run build
```

**Step 5: Final commit**
```bash
git add -A && git commit -m "refactor: complete claw-to-lumina rename across all user-facing strings"
```

---

## Execution Order Summary

| # | Task | Risk | Time Est |
|---|------|------|----------|
| 1 | Rename `lib/claw/` → `lib/lumina/` + types | Medium (many imports) | 15 min |
| 2 | Rename stores | Medium (many consumers) | 15 min |
| 3 | Rename hooks | Low | 5 min |
| 4 | Rename components | Medium (17 files + sidebar) | 20 min |
| 5 | Rename routes | Low-Medium | 10 min |
| 6 | DB migration (fields) | Medium (must not lose data) | 15 min |
| 7 | Add approval client methods | Low | 5 min |
| 8 | Add approval store + SSE | Low | 10 min |
| 9 | Add approvals panel UI | Low | 15 min |
| 10 | Add questions panel UI | Low | 15 min |
| 11 | Wire remaining SSE events | Low | 10 min |
| 12 | Fix timeouts | Low | 5 min |
| 13 | Final string cleanup | Low | 10 min |

**Total estimate: ~2.5 hours of focused execution**

Tasks 1-6 are the rename (must be sequential — each depends on prior).
Tasks 7-12 are independent and can be parallelized after the rename is done.
Task 13 is cleanup and must be last.
