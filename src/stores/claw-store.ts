// src/stores/claw-store.ts
import { create } from "zustand";
import { ClawClient } from "@/lib/claw/client";
import type { ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawScheduleRun, ClawInitiative, ClawConfig, ClawBriefing, ClawMonitor, ClawPipelineRun } from "@/lib/claw/types";
import { getSettings, updateSettings } from "@/lib/db/queries";

interface ClawState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  client: ClawClient | null;
  keysSynced: boolean;

  status: ClawStatus | null;
  tasks: ClawTask[];
  activity: ClawActivity[];
  schedules: ClawSchedule[];
  config: ClawConfig | null;
  scheduleRuns: Record<string, ClawScheduleRun[]>;
  initiatives: ClawInitiative[];
  briefing: ClawBriefing | null;
  monitors: ClawMonitor[];
  pipelineRuns: ClawPipelineRun[];

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
  updateConfig: (data: Partial<ClawConfig>) => Promise<void>;
  pushKeys: (keys: Record<string, string>) => Promise<string[]>;
  fetchScheduleRuns: (scheduleId: string) => Promise<void>;
  refreshInitiatives: () => Promise<void>;
  updateInitiative: (id: string, status: "approved" | "rejected" | "deferred") => Promise<void>;
  refreshBriefing: () => Promise<void>;
  refreshMonitors: () => Promise<void>;
  refreshPipelineRuns: () => Promise<void>;
  generateBriefing: () => Promise<ClawBriefing | null>;
  runPipeline: () => Promise<void>;
  createMonitor: (data: { name: string; type: string; config: Record<string, any> }) => Promise<string | null>;
  deleteMonitor: (id: string) => Promise<void>;
  chatWithClaw: (message: string, history?: Array<{ role: "user" | "assistant"; content: string }>) => Promise<{ response: string; taskId: string }>;
  initFromSettings: () => Promise<void>;
}

export const useClawStore = create<ClawState>((set, get) => ({
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

  connect: async (url, secret) => {
    const cleanUrl = url.trim().replace(/\/+$/, "");
    set({ isConnecting: true, error: null });
    try {
      const client = new ClawClient(cleanUrl, secret);
      const status = await client.getStatus();
      set({ client, isConnected: true, isConnecting: false, status, keysSynced: false });
      await updateSettings({ clawUrl: cleanUrl, clawSecret: secret, clawEnabled: true });
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
          mem0: "MEM0_API_KEY",
          composio: "COMPOSIO_API_KEY",
        };
        for (const k of keys) {
          const envName = providerToEnv[k.provider];
          if (envName) keyMap[envName] = k.key;
        }
        keyMap["MEM0_USER_ID"] = settings.memoryUserId || "default-user";
        if (Object.keys(keyMap).length > 0) {
          await client.pushKeys(keyMap);
          console.log(`[Claw] Keys synced successfully (attempt ${attempt})`);
          set({ keysSynced: true });
          const { useClawNotificationStore } = await import("@/stores/claw-notification-store");
          useClawNotificationStore.getState().addNotification({
            type: "keys:synced",
            title: "Keys Synced",
            message: `${Object.keys(keyMap).length} key(s) pushed to Claw`,
          });
          return true;
        }
        // No keys to sync — that's fine
        set({ keysSynced: true });
        return true;
      } catch (syncErr) {
        console.warn(`[Claw] Key sync attempt ${attempt}/${maxRetries} failed:`, syncErr);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }
    console.error("[Claw] Key sync failed after all retries");
    return false;
  },

  disconnect: async () => {
    set({ isConnected: false, client: null, status: null, tasks: [], activity: [], schedules: [], scheduleRuns: {}, initiatives: [], briefing: null, monitors: [], pipelineRuns: [], config: null, error: null, keysSynced: false });
    // Persist disabled state so auto-connect doesn't re-enable on next startup
    const { useSettingsStore } = await import("@/stores/settings-store");
    const settings = useSettingsStore.getState();
    if (settings.clawUrl) {
      await settings.updateClawSettings(settings.clawUrl, settings.clawSecret ?? "", false);
    }
  },

  refreshAll: async () => {
    const s = get();
    await Promise.allSettled([s.refreshTasks(), s.refreshActivity(), s.refreshSchedules(), s.refreshConfig(), s.refreshInitiatives(), s.refreshBriefing(), s.refreshMonitors(), s.refreshPipelineRuns()]);
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

  refreshInitiatives: async () => {
    const { client } = get();
    if (!client) return;
    try { const { initiatives } = await client.getInitiatives(); set({ initiatives }); }
    catch (e) { console.warn("[Claw] refresh initiatives:", (e as Error).message); }
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
    catch (e) { console.warn("[Claw] refresh briefing:", (e as Error).message); }
  },

  refreshMonitors: async () => {
    const { client } = get();
    if (!client) return;
    try { const { monitors } = await client.getMonitors(); set({ monitors }); }
    catch (e) { console.warn("[Claw] refresh monitors:", (e as Error).message); }
  },

  refreshPipelineRuns: async () => {
    const { client } = get();
    if (!client) return;
    try { const { runs } = await client.getPipelineRuns(10); set({ pipelineRuns: runs }); }
    catch (e) { console.warn("[Claw] refresh pipeline runs:", (e as Error).message); }
  },

  generateBriefing: async () => {
    const { client } = get();
    if (!client) return null;
    try {
      const { briefing } = await client.generateBriefing();
      set({ briefing });
      return briefing;
    } catch (e) {
      console.warn("[Claw] generate briefing:", (e as Error).message);
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
      console.warn("[Claw] fetch schedule runs:", (e as Error).message);
    }
  },

  chatWithClaw: async (message, history) => {
    const { client, keysSynced } = get();
    if (!client) throw new Error("Not connected to Claw");
    // Ensure keys are synced before first chat
    if (!keysSynced) {
      await get().syncKeys();
    }
    return client.chat(message, history);
  },

  initFromSettings: async () => {
    try {
      const settings = await getSettings();
      if (settings.clawEnabled && settings.clawUrl && settings.clawSecret) {
        console.log("[Claw] Auto-connecting to", settings.clawUrl);
        await get().connect(settings.clawUrl, settings.clawSecret);
        console.log("[Claw] Auto-connect result:", get().isConnected ? "connected" : "failed", get().error);
      } else {
        console.log("[Claw] Skipping auto-connect — enabled:", settings.clawEnabled, "url:", !!settings.clawUrl, "secret:", !!settings.clawSecret);
      }
    } catch (e) {
      console.warn("[Claw] initFromSettings error:", e);
    }
  },
}));
