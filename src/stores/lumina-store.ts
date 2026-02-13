// src/stores/lumina-store.ts
import { create } from "zustand";
import { LuminaClient } from "@/lib/lumina/client";
import type { LuminaStatus, LuminaTask, LuminaActivity, LuminaSchedule, LuminaScheduleRun, LuminaInitiative, LuminaConfig, LuminaBriefing, LuminaMonitor, LuminaPipelineRun, CostData, PendingQuestion, Codebase, LuminaTrace, LuminaToolCall, ToolCallStats, LuminaProject, LuminaApproval } from "@/lib/lumina/types";
import { getSettings, updateSettings } from "@/lib/db/queries";

function getLocalhostFallbackUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "localhost") return null;
    // If Lumina is served from localhost, keep Lumina on localhost as well.
    // Some CSPs allow localhost but block 127.0.0.1, which causes a retry loop.
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return null;
    }
    parsed.hostname = "127.0.0.1";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function normalizeLocalLuminaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "localhost" &&
      parsed.hostname === "127.0.0.1"
    ) {
      parsed.hostname = "localhost";
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    // Fall through and return as-is.
  }
  return url;
}

interface LuminaState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  client: LuminaClient | null;
  keysSynced: boolean;

  status: LuminaStatus | null;
  tasks: LuminaTask[];
  activity: LuminaActivity[];
  schedules: LuminaSchedule[];
  config: LuminaConfig | null;
  scheduleRuns: Record<string, LuminaScheduleRun[]>;
  initiatives: LuminaInitiative[];
  briefing: LuminaBriefing | null;
  monitors: LuminaMonitor[];
  pipelineRuns: LuminaPipelineRun[];
  cost: CostData | null;
  questions: PendingQuestion[];
  codebases: Codebase[];
  openProjects: LuminaProject[];
  focusedProject: LuminaProject | null;
  traces: LuminaTrace[];
  toolCalls: LuminaToolCall[];
  toolCallsTotal: number;
  toolCallStats: ToolCallStats | null;
  approvals: LuminaApproval[];

  connect: (url: string, secret: string) => Promise<void>;
  disconnect: () => void;
  syncKeys: () => Promise<boolean>;
  refreshAll: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  refreshSchedules: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  createTask: (instruction: string) => Promise<string | null>;
  deleteTask: (id: string) => Promise<void>;
  createSchedule: (name: string, cron: string) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  updateConfig: (data: Partial<LuminaConfig>) => Promise<void>;
  pushKeys: (keys: Record<string, string>) => Promise<string[]>;
  fetchScheduleRuns: (scheduleId: string) => Promise<void>;
  refreshInitiatives: () => Promise<void>;
  updateInitiative: (id: string, status: "approved" | "rejected" | "deferred") => Promise<void>;
  refreshBriefing: () => Promise<void>;
  refreshMonitors: () => Promise<void>;
  refreshPipelineRuns: () => Promise<void>;
  generateBriefing: () => Promise<LuminaBriefing | null>;
  runPipeline: () => Promise<void>;
  createMonitor: (data: { name: string; type: string; config: Record<string, any> }) => Promise<string | null>;
  deleteMonitor: (id: string) => Promise<void>;
  chatWithLumina: (message: string, history?: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ response: string; taskId: string }>;
  initFromSettings: () => Promise<void>;

  // Approvals
  refreshApprovals: () => Promise<void>;
  respondToApproval: (id: string, approved: boolean) => Promise<void>;

  // Cost & Questions
  refreshCost: () => Promise<void>;
  refreshQuestions: () => Promise<void>;
  answerQuestion: (id: string, answer: string) => Promise<void>;
  dismissQuestion: (id: string) => Promise<void>;
  emergencyStop: () => Promise<{ ok: boolean; message: string } | null>;

  // Traces & Tool Calls
  refreshTraces: (source?: string) => Promise<void>;
  refreshToolCalls: (filters?: { toolName?: string; source?: string; success?: boolean; limit?: number; offset?: number }) => Promise<void>;
  refreshToolCallStats: () => Promise<void>;

  // Codebase methods
  refreshCodebases: () => Promise<void>;
  registerCodebase: (name: string, path: string, description?: string) => Promise<Codebase | null>;
  indexCodebase: (id: string, incremental?: boolean) => Promise<void>;
  deleteCodebase: (id: string) => Promise<void>;

  // Workspace methods
  refreshOpenProjects: () => Promise<void>;
  openProjectByPath: (path: string) => Promise<LuminaProject | null>;
  focusProject: (id: string) => Promise<void>;
  closeProject: (id: string) => Promise<void>;
}

export const useLuminaStore = create<LuminaState>((set, get) => ({
  isConnected: false,
  isConnecting: false,
  error: null,
  client: null,
  keysSynced: false,
  status: null,
  tasks: [],
  activity: [],
  schedules: [],
  config: null,
  scheduleRuns: {},
  initiatives: [],
  briefing: null,
  monitors: [],
  pipelineRuns: [],
  cost: null,
  questions: [],
  codebases: [],
  openProjects: [],
  focusedProject: null,
  traces: [],
  toolCalls: [],
  toolCallsTotal: 0,
  toolCallStats: null,
  approvals: [],

  connect: async (url, secret) => {
    if (get().isConnecting) {
      return;
    }
    const cleanUrl = normalizeLocalLuminaUrl(url.trim().replace(/\/+$/, ""));
    set({ isConnecting: true, error: null });
    try {
      let resolvedUrl = cleanUrl;
      let client = new LuminaClient(cleanUrl, secret);
      let status: LuminaStatus;
      try {
        status = await client.getStatus();
      } catch (primaryErr) {
        const fallbackUrl = getLocalhostFallbackUrl(cleanUrl);
        if (!fallbackUrl) {
          throw primaryErr;
        }
        console.warn(`[Lumina] Primary URL failed (${cleanUrl}); retrying with ${fallbackUrl}`);
        client = new LuminaClient(fallbackUrl, secret);
        status = await client.getStatus();
        resolvedUrl = fallbackUrl;
      }
      // /status is intentionally public; validate the secret against a protected route.
      await client.verifyAuth();
      set({ client, isConnected: true, isConnecting: false, status, keysSynced: false });
      await updateSettings({ luminaUrl: resolvedUrl, luminaSecret: secret, luminaEnabled: true });
      await get().refreshAll();
      // Auto-sync keys with retry
      await get().syncKeys();
    } catch (e) {
      const msg = (e as Error).message;
      set({ isConnecting: false, isConnected: false, error: `URL: ${cleanUrl}/status | ${msg}` });
    }
  },

  syncKeys: async () => {
    const { client } = get();
    if (!client) return false;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { useApiKeysStore } = await import("@/stores/api-keys-store");
        const { useSettingsStore } = await import("@/stores/settings-store");
        const apiKeysState = useApiKeysStore.getState();
        if (!apiKeysState.isLoaded) {
          await apiKeysState.loadKeys();
        }
        const keys = useApiKeysStore.getState().keys;
        const settingsState = useSettingsStore.getState();
        if (!settingsState.isLoaded) {
          await settingsState.loadSettings();
        }
        const settings = useSettingsStore.getState();
        const keyMap: Record<string, string> = {};
        const providerToEnv: Record<string, string> = {
          openrouter: "OPENROUTER_API_KEY",
          composio: "COMPOSIO_API_KEY",
        };
        for (const k of keys) {
          const envName = providerToEnv[k.provider];
          if (envName) keyMap[envName] = k.key;
        }
        if (Object.keys(keyMap).length > 0) {
          await client.pushKeys(keyMap);
          console.log(`[Lumina] Keys synced successfully (attempt ${attempt})`);
          set({ keysSynced: true });
          const { useLuminaNotificationStore } = await import("@/stores/lumina-notification-store");
          useLuminaNotificationStore.getState().addNotification({
            type: "keys:synced",
            title: "Keys Synced",
            message: `${Object.keys(keyMap).length} key(s) pushed to Lumina`,
          });
          return true;
        }
        // No keys to sync — that's fine
        set({ keysSynced: true });
        return true;
      } catch (syncErr) {
        console.warn(`[Lumina] Key sync attempt ${attempt}/${maxRetries} failed:`, syncErr);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }
    console.error("[Lumina] Key sync failed after all retries");
    return false;
  },

  disconnect: async () => {
    set({ isConnected: false, client: null, status: null, tasks: [], activity: [], schedules: [], scheduleRuns: {}, initiatives: [], briefing: null, monitors: [], pipelineRuns: [], cost: null, questions: [], config: null, error: null, keysSynced: false, codebases: [], openProjects: [], focusedProject: null, traces: [], toolCalls: [], toolCallsTotal: 0, toolCallStats: null, approvals: [] });
    // Persist disabled state so auto-connect doesn't re-enable on next startup
    const { useSettingsStore } = await import("@/stores/settings-store");
    const settings = useSettingsStore.getState();
    if (settings.luminaUrl) {
      await settings.updateLuminaSettings(settings.luminaUrl, settings.luminaSecret ?? "", false);
    }
  },

  refreshAll: async () => {
    const s = get();
    await Promise.allSettled([s.refreshTasks(), s.refreshActivity(), s.refreshSchedules(), s.refreshConfig(), s.refreshInitiatives(), s.refreshBriefing(), s.refreshMonitors(), s.refreshPipelineRuns(), s.refreshCodebases(), s.refreshOpenProjects(), s.refreshCost(), s.refreshQuestions(), s.refreshApprovals(), s.refreshTraces(), s.refreshToolCalls(), s.refreshToolCallStats()]);
  },

  refreshTasks: async () => {
    const { client } = get();
    if (!client) return;
    try { const { tasks } = await client.getTasks(); set({ tasks }); }
    catch (e) { console.warn("[Lumina] refresh tasks:", (e as Error).message); }
  },

  refreshActivity: async () => {
    const { client } = get();
    if (!client) return;
    try { const { activity } = await client.getActivity(50); set({ activity }); }
    catch (e) { console.warn("[Lumina] refresh activity:", (e as Error).message); }
  },

  refreshSchedules: async () => {
    const { client } = get();
    if (!client) return;
    try { const { schedules } = await client.getSchedules(); set({ schedules }); }
    catch (e) { console.warn("[Lumina] refresh schedules:", (e as Error).message); }
  },

  refreshConfig: async () => {
    const { client } = get();
    if (!client) return;
    try { const { config } = await client.getConfig(); set({ config }); }
    catch (e) { console.warn("[Lumina] refresh config:", (e as Error).message); }
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

  refreshInitiatives: async () => {
    const { client } = get();
    if (!client) return;
    try { const { initiatives } = await client.getInitiatives(); set({ initiatives }); }
    catch (e) { console.warn("[Lumina] refresh initiatives:", (e as Error).message); }
  },

  updateInitiative: async (id, status) => {
    const { client } = get();
    if (!client) return;
    await client.updateInitiative(id, status);
    await get().refreshInitiatives();
  },

  refreshBriefing: async () => {
    const { client } = get();
    if (!client) return;
    try { const { briefing } = await client.getLatestBriefing(); set({ briefing }); }
    catch (e) { console.warn("[Lumina] refresh briefing:", (e as Error).message); }
  },

  refreshMonitors: async () => {
    const { client } = get();
    if (!client) return;
    try { const { monitors } = await client.getMonitors(); set({ monitors }); }
    catch (e) { console.warn("[Lumina] refresh monitors:", (e as Error).message); }
  },

  refreshPipelineRuns: async () => {
    const { client } = get();
    if (!client) return;
    try { const { runs } = await client.getPipelineRuns(10); set({ pipelineRuns: runs }); }
    catch (e) { console.warn("[Lumina] refresh pipeline runs:", (e as Error).message); }
  },

  generateBriefing: async () => {
    const { client } = get();
    if (!client) return null;
    try {
      const { briefing } = await client.generateBriefing();
      set({ briefing });
      return briefing;
    } catch (e) {
      console.warn("[Lumina] generate briefing:", (e as Error).message);
      return null;
    }
  },

  runPipeline: async () => {
    const { client } = get();
    if (!client) return;
    await client.runPipeline();
  },

  createMonitor: async (data) => {
    const { client } = get();
    if (!client) return null;
    const { id } = await client.createMonitor(data);
    await get().refreshMonitors();
    return id;
  },

  deleteMonitor: async (id) => {
    const { client } = get();
    if (!client) return;
    await client.deleteMonitor(id);
    set((s) => ({ monitors: s.monitors.filter((m) => m.id !== id) }));
  },

  fetchScheduleRuns: async (scheduleId) => {
    const { client } = get();
    if (!client) return;
    try {
      const { runs } = await client.getScheduleRuns(scheduleId);
      set((s) => ({ scheduleRuns: { ...s.scheduleRuns, [scheduleId]: runs } }));
    } catch (e) {
      console.warn("[Lumina] fetch schedule runs:", (e as Error).message);
    }
  },

  chatWithLumina: async (message, history) => {
    const { client, keysSynced } = get();
    if (!client) throw new Error("Not connected to Lumina");
    // Ensure keys are synced before first chat
    if (!keysSynced) {
      await get().syncKeys();
    }
    return client.chat(message, history);
  },

  initFromSettings: async () => {
    try {
      if (get().isConnected || get().isConnecting) {
        return;
      }
      const settings = await getSettings();
      if (settings.luminaEnabled && settings.luminaUrl && settings.luminaSecret) {
        if (get().isConnected || get().isConnecting) {
          return;
        }
        console.log("[Lumina] Auto-connecting to", settings.luminaUrl);
        await get().connect(settings.luminaUrl, settings.luminaSecret);
        console.log("[Lumina] Auto-connect result:", get().isConnected ? "connected" : "failed", get().error);
      } else {
        console.log("[Lumina] Skipping auto-connect — enabled:", settings.luminaEnabled, "url:", !!settings.luminaUrl, "secret:", !!settings.luminaSecret);
      }
    } catch (e) {
      console.warn("[Lumina] initFromSettings error:", e);
    }
  },

  // Approvals
  refreshApprovals: async () => {
    const { client } = get();
    if (!client) return;
    try { const { approvals } = await client.getApprovals(); set({ approvals }); }
    catch {}
  },

  respondToApproval: async (id, approved) => {
    const { client } = get();
    if (!client) return;
    try {
      await client.respondToApproval(id, approved);
      set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) }));
    } catch {}
  },

  refreshCost: async () => {
    const { client } = get();
    if (!client) return;
    try { const { cost } = await client.getCost(); set({ cost }); }
    catch (e) { console.warn("[Lumina] refresh cost:", (e as Error).message); }
  },

  refreshQuestions: async () => {
    const { client } = get();
    if (!client) return;
    try { const { questions } = await client.getQuestions(); set({ questions }); }
    catch (e) { console.warn("[Lumina] refresh questions:", (e as Error).message); }
  },

  answerQuestion: async (id, answer) => {
    const { client } = get();
    if (!client) return;
    await client.answerQuestion(id, answer);
    set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }));
  },

  dismissQuestion: async (id) => {
    const { client } = get();
    if (!client) return;
    await client.dismissQuestion(id);
    set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }));
  },

  emergencyStop: async () => {
    const { client } = get();
    if (!client) return null;
    return client.emergencyStop();
  },

  // Traces & Tool Calls
  refreshTraces: async (source?: string) => {
    const { client } = get();
    if (!client) return;
    try { const { traces } = await client.getTraces(source); set({ traces }); }
    catch (e) { console.warn("[Lumina] refresh traces:", (e as Error).message); }
  },

  refreshToolCalls: async (filters) => {
    const { client } = get();
    if (!client) return;
    try {
      const { toolCalls, total } = await client.getToolCalls(filters);
      set({ toolCalls, toolCallsTotal: total });
    }
    catch (e) { console.warn("[Lumina] refresh tool calls:", (e as Error).message); }
  },

  refreshToolCallStats: async () => {
    const { client } = get();
    if (!client) return;
    try { const { stats } = await client.getToolCallStats(); set({ toolCallStats: stats }); }
    catch (e) { console.warn("[Lumina] refresh tool call stats:", (e as Error).message); }
  },

  // Codebase methods
  refreshCodebases: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const { codebases } = await client.listCodebases();
      set({ codebases });
    } catch (e) {
      console.warn("[Lumina] refresh codebases:", (e as Error).message);
    }
  },

  registerCodebase: async (name, path, description) => {
    const { client } = get();
    if (!client) return null;
    try {
      const { codebase } = await client.registerCodebase(name, path, description);
      set((s) => ({ codebases: [...s.codebases, codebase] }));
      return codebase;
    } catch (e) {
      console.error("[Lumina] register codebase:", (e as Error).message);
      return null;
    }
  },

  indexCodebase: async (id, incremental = false) => {
    const { client } = get();
    if (!client) return;
    try {
      await client.indexCodebase(id, incremental);
      // Update local status to indexing
      set((s) => ({
        codebases: s.codebases.map((c) =>
          c.id === id ? { ...c, status: "indexing" as const } : c
        ),
      }));
    } catch (e) {
      console.error("[Lumina] index codebase:", (e as Error).message);
    }
  },

  deleteCodebase: async (id) => {
    const { client } = get();
    if (!client) return;
    try {
      await client.deleteCodebase(id);
      set((s) => ({ codebases: s.codebases.filter((c) => c.id !== id) }));
    } catch (e) {
      console.error("[Lumina] delete codebase:", (e as Error).message);
    }
  },

  // Workspace methods
  refreshOpenProjects: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const { projects } = await client.getOpenProjects();
      const focused = projects.find((p) => p.isFocused) ?? null;
      set({ openProjects: projects, focusedProject: focused });
    } catch (e) {
      console.warn("[Lumina] refresh open projects:", (e as Error).message);
    }
  },

  openProjectByPath: async (path) => {
    const { client } = get();
    if (!client) return null;
    try {
      const { project } = await client.openProject(path);
      await get().refreshOpenProjects();
      return project;
    } catch (e) {
      console.error("[Lumina] open project:", (e as Error).message);
      return null;
    }
  },

  focusProject: async (id) => {
    const { client } = get();
    if (!client) return;
    try {
      await client.focusProject(id);
      await get().refreshOpenProjects();
    } catch (e) {
      console.error("[Lumina] focus project:", (e as Error).message);
    }
  },

  closeProject: async (id) => {
    const { client } = get();
    if (!client) return;
    try {
      await client.closeProject(id);
      set((s) => ({
        openProjects: s.openProjects.filter((p) => p.id !== id),
        focusedProject: s.focusedProject?.id === id ? null : s.focusedProject,
      }));
    } catch (e) {
      console.error("[Lumina] close project:", (e as Error).message);
    }
  },
}));
