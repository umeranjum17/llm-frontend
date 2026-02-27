import { create } from "zustand";
import { getSettings, updateSettings } from "@/lib/db/queries";
import type { UserSettings } from "@/lib/db/schema";

interface SettingsState extends Partial<UserSettings> {
  isLoaded: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  updateDisplayName: (name: string | undefined) => Promise<void>;
  updateDefaultExecutionTarget: (target: "lumina" | "lumina_cli") => Promise<void>;
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
  updateDefaultReasoningLevel: (level: "low" | "medium" | "high" | "xhigh") => Promise<void>;
  updateLastProviderForModel: (modelId: string, providerId: string) => Promise<void>;
  updateDefaultTemperature: (temperature: number) => Promise<void>;
  updateDefaultMaxTokens: (maxTokens: number) => Promise<void>;
  updateLuminaSettings: (url: string, secret: string, enabled: boolean) => Promise<void>;
  updateIncognitoDefault: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  isLoaded: false,
  theme: "system",
  defaultExecutionTarget: "lumina",
  defaultModelIdsByProvider: {},
  defaultMcpServerIds: [],
  enabledTools: [],
  shortcuts: {},
  autoTaggingEnabled: false,
  defaultReasoningLevel: "medium",
  lastProviderIdByModel: {},
  defaultTemperature: 1,
  defaultMaxTokens: 4096,
  incognitoDefault: false,

  loadSettings: async () => {
    const maxRetries = 3;
    let retryCount = 0;
    
    const attemptLoad = async (): Promise<void> => {
      try {
        const settings = await getSettings();
        // Preserve defaults for arrays that might be undefined in DB
        set({
          ...settings,
          defaultExecutionTarget: settings.defaultExecutionTarget ?? "lumina",
          defaultMcpServerIds: settings.defaultMcpServerIds ?? [],
          enabledTools: settings.enabledTools ?? [],
          shortcuts: settings.shortcuts ?? {},
          lastProviderIdByModel: settings.lastProviderIdByModel ?? {},
          isLoaded: true
        });
      } catch (error) {
        const errorObj = error as Error;
        const errorName = errorObj?.name || "UnknownError";
        
        console.warn(`[Settings Store] Failed to load settings (attempt ${retryCount + 1}/${maxRetries + 1}):`, errorObj?.message);
        
        // Check if it's a DB-related error
        const isDBError = 
          errorName === "DatabaseClosedError" ||
          errorName === "InvalidStateError" ||
          errorName === "VersionError" ||
          errorObj?.message?.includes("database");
        
        if (isDBError && retryCount < maxRetries) {
          // Retry with fast backoff (500ms, 1s, 1.5s max)
          retryCount++;
          const backoffMs = Math.min(500 * retryCount, 1500);
          console.log(`[Settings Store] Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          return attemptLoad(); // Recursive retry
        } else if (isDBError) {
          // DB health hook will handle recovery, but we should still set defaults
          console.warn("[Settings Store] Max retries reached, using defaults");
          set({
            theme: "system",
            defaultExecutionTarget: "lumina",
            defaultModelIdsByProvider: {},
            defaultMcpServerIds: [],
            enabledTools: [],
            shortcuts: {},
            autoTaggingEnabled: false,
            defaultReasoningLevel: "medium",
            lastProviderIdByModel: {},
            defaultTemperature: 1,
            defaultMaxTokens: 4096,
            isLoaded: true, // Mark as loaded to prevent UI hang
          });
        } else {
          // Re-throw non-DB errors
          throw error;
        }
      }
    };
    
    return attemptLoad();
  },

  updateTheme: async (theme) => {
    await updateSettings({ theme });
    set({ theme });
  },

  updateDisplayName: async (name) => {
    await updateSettings({ displayName: name });
    set({ displayName: name });
  },

  updateDefaultExecutionTarget: async (target) => {
    await updateSettings({ defaultExecutionTarget: target });
    set({ defaultExecutionTarget: target });
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
    await updateSettings({ defaultMcpServerIds: serverIds });
    set({ defaultMcpServerIds: serverIds });
  },

  updateEmbeddingsConfig: async (provider, modelId) => {
    await updateSettings({
      embeddingsProvider: provider,
      embeddingsModelId: modelId
    });
    set({ embeddingsProvider: provider, embeddingsModelId: modelId });
  },

  updateSkillMatchThreshold: async (threshold: number) => {
    await updateSettings({ skillMatchThreshold: threshold });
    set({ skillMatchThreshold: threshold });
  },

  updateDefaultReasoningLevel: async (level: "low" | "medium" | "high" | "xhigh") => {
    await updateSettings({ defaultReasoningLevel: level });
    set({ defaultReasoningLevel: level });
  },

  updateLastProviderForModel: async (modelId: string, providerId: string) => {
    const current = get().lastProviderIdByModel ?? {};
    const updated = { ...current, [modelId]: providerId };
    await updateSettings({ lastProviderIdByModel: updated });
    set({ lastProviderIdByModel: updated });
  },

  updateDefaultTemperature: async (temperature: number) => {
    await updateSettings({ defaultTemperature: temperature });
    set({ defaultTemperature: temperature });
  },

  updateDefaultMaxTokens: async (maxTokens: number) => {
    await updateSettings({ defaultMaxTokens: maxTokens });
    set({ defaultMaxTokens: maxTokens });
  },

  updateLuminaSettings: async (url, secret, enabled) => {
    await updateSettings({ luminaUrl: url, luminaSecret: secret, luminaEnabled: enabled });
    set({ luminaUrl: url, luminaSecret: secret, luminaEnabled: enabled });
  },

  updateIncognitoDefault: async (enabled) => {
    await updateSettings({ incognitoDefault: enabled });
    set({ incognitoDefault: enabled });
  },
}));
