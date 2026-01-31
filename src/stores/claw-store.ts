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

  disconnect: async () => {
    set({ isConnected: false, client: null, status: null, tasks: [], activity: [], schedules: [], config: null, error: null });
    // Persist disabled state so auto-connect doesn't re-enable on next startup
    const { useSettingsStore } = await import("@/stores/settings-store");
    const settings = useSettingsStore.getState();
    if (settings.clawUrl) {
      await settings.updateClawSettings(settings.clawUrl, settings.clawSecret ?? "", false);
    }
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
