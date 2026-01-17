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
  updateAutoTagging: (enabled: boolean) => Promise<void>;
  updateDefaultMcpServerIds: (serverIds: string[]) => Promise<void>;
  updateEmbeddingsConfig: (provider: "openrouter" | "openai", modelId: string) => Promise<void>;
  updateSkillMatchThreshold: (threshold: number) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  isLoaded: false,
  theme: "system",
  defaultModelIdsByProvider: {},
  defaultMcpServerIds: [],
  enabledTools: [],
  shortcuts: {},
  autoTaggingEnabled: false,

  loadSettings: async () => {
    const settings = await getSettings();
    console.log("[Settings] v2 - Loaded from DB:", settings);
    console.log("[Settings] v2 - defaultMcpServerIds from DB:", settings.defaultMcpServerIds);
    // Preserve defaults for arrays that might be undefined in DB
    set({
      ...settings,
      defaultMcpServerIds: settings.defaultMcpServerIds ?? [],
      enabledTools: settings.enabledTools ?? [],
      shortcuts: settings.shortcuts ?? {},
      isLoaded: true
    });
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

  updateAutoTagging: async (enabled) => {
    await updateSettings({ autoTaggingEnabled: enabled });
    set({ autoTaggingEnabled: enabled });
  },

  updateDefaultMcpServerIds: async (serverIds) => {
    console.log("[Settings] Saving defaultMcpServerIds:", serverIds);
    await updateSettings({ defaultMcpServerIds: serverIds });
    set({ defaultMcpServerIds: serverIds });
  },

  updateEmbeddingsConfig: async (provider, modelId) => {
    console.log("[Settings] Saving embeddings config:", { provider, modelId });
    await updateSettings({
      embeddingsProvider: provider,
      embeddingsModelId: modelId
    });
    set({ embeddingsProvider: provider, embeddingsModelId: modelId });
  },

  updateSkillMatchThreshold: async (threshold: number) => {
    console.log("[Settings] Saving skill match threshold:", threshold);
    await updateSettings({ skillMatchThreshold: threshold });
    set({ skillMatchThreshold: threshold });
  },
}));
