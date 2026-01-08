import { create } from "zustand";
import { getSettings, updateSettings } from "@/lib/db/queries";
import type { UserSettings } from "@/lib/db/schema";

interface SettingsState extends Partial<UserSettings> {
  isLoaded: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  updateDefaultModel: (modelId: string) => Promise<void>;
  updateDefaultChatDefaults: (opts: {
    defaultProviderId?: string;
    defaultModelId?: string;
    defaultModelIdsByProvider?: Record<string, string>;
  }) => Promise<void>;
  updateEnabledTools: (tools: string[]) => Promise<void>;
  updateShortcuts: (shortcuts: Record<string, string>) => Promise<void>;
  updateSidebarWidth: (width: number) => Promise<void>;
  updateCurrentProject: (projectId: string | undefined) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  isLoaded: false,
  theme: "system",
  defaultModelIdsByProvider: {},
  enabledTools: [],
  shortcuts: {},

  loadSettings: async () => {
    const settings = await getSettings();
    set({ ...settings, isLoaded: true });
  },

  updateTheme: async (theme) => {
    await updateSettings({ theme });
    set({ theme });
  },

  updateDefaultModel: async (modelId) => {
    await updateSettings({ defaultModelId: modelId });
    set({ defaultModelId: modelId });
  },

  updateDefaultChatDefaults: async (opts) => {
    await updateSettings({
      defaultProviderId: opts.defaultProviderId,
      defaultModelId: opts.defaultModelId,
      defaultModelIdsByProvider: opts.defaultModelIdsByProvider,
    });
    set({
      defaultProviderId: opts.defaultProviderId,
      defaultModelId: opts.defaultModelId,
      defaultModelIdsByProvider: opts.defaultModelIdsByProvider,
    });
  },

  updateEnabledTools: async (tools) => {
    await updateSettings({ enabledTools: tools });
    set({ enabledTools: tools });
  },

  updateShortcuts: async (shortcuts) => {
    await updateSettings({ shortcuts });
    set({ shortcuts });
  },

  updateSidebarWidth: async (width) => {
    await updateSettings({ sidebarWidth: width });
    set({ sidebarWidth: width });
  },

  updateCurrentProject: async (projectId) => {
    await updateSettings({ currentProjectId: projectId });
    set({ currentProjectId: projectId });
  },
}));
