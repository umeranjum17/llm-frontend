import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Skill, Agent } from "@/lib/db/schema";

export interface Artifact {
  id: string;
  title: string;
  code: string; // Main code or readme
  language: string;
  type: 'code' | 'image' | 'video' | 'html' | 'markdown' | 'csv' | 'sheet' | 'chart' | 'docx' | 'project' | 'slides' | 'document' | 'spreadsheet';
  files?: Record<string, string>; // path -> content
  template?: string; // e.g. 'react', 'node', 'vite'
  entry?: string; // e.g. '/App.tsx'
}

export interface DraftChatConfig {
  modelId: string;
  providerId?: string;
  agentId?: string;
  activeMcpServerIds?: string[];
  reasoningLevel?: string;
  temperature?: number;
  maxTokens?: number;
  projectId?: string;
}

// Multi-model panel configuration
export interface MultiModelPanel {
  id: string;
  modelId: string;
  isCollapsed: boolean;
}

// localStorage key for remembering last used models in multi-model mode
const MULTI_MODEL_LAST_USED_KEY = "multiModelLastUsed";

// sessionStorage key for skill editor prefill data
const SKILL_PREFILL_KEY = "skillEditorPrefill";

// Get last used models from localStorage or return defaults
function getLastUsedModels(defaultModelId: string): string[] {
  if (typeof window === "undefined") return [defaultModelId, "anthropic/claude-3.5-sonnet"];
  try {
    const stored = localStorage.getItem(MULTI_MODEL_LAST_USED_KEY);
    if (stored) {
      const models = JSON.parse(stored);
      if (Array.isArray(models) && models.length >= 2) {
        return models;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return [defaultModelId, "anthropic/claude-3.5-sonnet"];
}

// Save last used models to localStorage
function saveLastUsedModels(models: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MULTI_MODEL_LAST_USED_KEY, JSON.stringify(models));
  } catch {
    // Ignore storage errors
  }
}

interface UIState {
  sidebarCollapsed: boolean;
  activeChatId: string | null;
  commandPaletteOpen: boolean;
  modelPickerOpen: boolean;
  toolSelectorOpen: boolean;
  showArtifacts: boolean;
  activeArtifact: Artifact | null;
  artifactTabs: Artifact[]; // Multi-artifact tabs
  isFocusMode: boolean;
  artifactsFullscreen: boolean;
  skillEditorOpen: boolean;
  skillEditorPrefilledData: Partial<Skill> | null;
  skillEditorTargetId: string | null; // ID of skill to edit (for edit flows)
  agentEditorOpen: boolean;
  agentEditorPrefilledData: Partial<Agent> | null;
  agentEditorTargetId: string | null; // ID of agent to edit (for edit flows)
  draftChatConfig: DraftChatConfig | null; // Config for draft chat (when activeChatId is null)

  // Multi-model mode (replaces arena mode and split view)
  isMultiModelMode: boolean;
  multiModelPanels: MultiModelPanel[];
  activePanelId: string | null; // For mobile tab tracking

  // Actions
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveChatId: (chatId: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setModelPickerOpen: (open: boolean) => void;
  setToolSelectorOpen: (open: boolean) => void;
  setShowArtifacts: (show: boolean) => void;
  setActiveArtifact: (artifact: Artifact | null) => void;
  addArtifactTab: (artifact: Artifact) => void;
  removeArtifactTab: (id: string) => void;
  clearArtifactTabs: () => void;
  setIsFocusMode: (enabled: boolean) => void;
  setArtifactsFullscreen: (fullscreen: boolean) => void;
  setSkillEditorOpen: (open: boolean) => void;
  openSkillEditorWithData: (data: Partial<Skill>, targetId?: string | null, returnTo?: string | null) => void;
  clearSkillEditorData: () => void;
  setAgentEditorOpen: (open: boolean) => void;
  openAgentEditorWithData: (data: Partial<Agent>, targetId?: string | null) => void;
  clearAgentEditorData: () => void;
  setDraftChatConfig: (config: DraftChatConfig | null) => void;
  clearDraftChatConfig: () => void;

  // Multi-model mode actions
  toggleMultiModelMode: (currentModelId?: string) => void;
  addModelPanel: (modelId: string) => void;
  removeModelPanel: (panelId: string) => void;
  updatePanelModel: (panelId: string, modelId: string) => void;
  resetMultiModelMode: () => void;
  setActivePanelId: (panelId: string | null) => void;
  togglePanelCollapse: (panelId: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  activeChatId: null,
  commandPaletteOpen: false,
  modelPickerOpen: false,
  toolSelectorOpen: false,
  showArtifacts: false,
  activeArtifact: null,
  artifactTabs: [],
  isFocusMode: false,
  artifactsFullscreen: false,
  skillEditorOpen: false,
  skillEditorPrefilledData: null,
  skillEditorTargetId: null,
  agentEditorOpen: false,
  agentEditorPrefilledData: null,
  agentEditorTargetId: null,
  draftChatConfig: null,

  // Multi-model mode - ephemeral state (resets on chat change or page refresh)
  isMultiModelMode: false,
  multiModelPanels: [],
  activePanelId: null,

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveChatId: (chatId) => {
    // Reset multi-model mode when changing chats
    set({
      activeChatId: chatId,
      isMultiModelMode: false,
      multiModelPanels: [],
      activePanelId: null,
    });
  },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setModelPickerOpen: (open) => set({ modelPickerOpen: open }),
  setToolSelectorOpen: (open) => set({ toolSelectorOpen: open }),
  setShowArtifacts: (show) => set({ showArtifacts: show }),
  setActiveArtifact: (artifact) => {
    const state = get();
    // Also add to tabs if not already there
    if (artifact && !state.artifactTabs.find(t => t.id === artifact.id)) {
      set({
        activeArtifact: artifact,
        artifactTabs: [...state.artifactTabs, artifact],
        showArtifacts: true,
      });
    } else {
      set({ activeArtifact: artifact, showArtifacts: artifact !== null });
    }
  },
  addArtifactTab: (artifact) => {
    const state = get();
    if (!state.artifactTabs.find(t => t.id === artifact.id)) {
      set({
        artifactTabs: [...state.artifactTabs, artifact],
        activeArtifact: artifact,
        showArtifacts: true,
      });
    } else {
      set({ activeArtifact: artifact });
    }
  },
  removeArtifactTab: (id) => {
    const state = get();
    const newTabs = state.artifactTabs.filter(t => t.id !== id);
    const newActive = state.activeArtifact?.id === id
      ? (newTabs.length > 0 ? newTabs[newTabs.length - 1] : null)
      : state.activeArtifact;
    set({
      artifactTabs: newTabs,
      activeArtifact: newActive,
      showArtifacts: newTabs.length > 0,
    });
  },
  clearArtifactTabs: () => set({ artifactTabs: [], activeArtifact: null, showArtifacts: false }),
  setIsFocusMode: (enabled) => set({ isFocusMode: enabled }),
  setArtifactsFullscreen: (fullscreen) => set({ artifactsFullscreen: fullscreen }),
  setSkillEditorOpen: (open) => set({ skillEditorOpen: open }),
  openSkillEditorWithData: (data, targetId, returnTo) => {
    // Store prefill data in sessionStorage for refresh survival
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          SKILL_PREFILL_KEY,
          JSON.stringify({
            data,
            targetId: targetId || null,
            returnTo: returnTo || null,
          })
        );

        // Navigate to the appropriate route
        const url = targetId ? `/skills/${targetId}/edit` : "/skills/new";
        const fullUrl = returnTo
          ? `${url}?returnTo=${encodeURIComponent(returnTo)}`
          : url;
        window.location.href = fullUrl;
      } catch (error) {
        console.error("Failed to store prefill data:", error);
      }
    }
  },
  clearSkillEditorData: () => set({ skillEditorPrefilledData: null, skillEditorTargetId: null }),
  setAgentEditorOpen: (open) => set({ agentEditorOpen: open }),
  openAgentEditorWithData: (data, targetId) => {
    set({
      agentEditorOpen: true,
      agentEditorPrefilledData: data,
      agentEditorTargetId: targetId || null
    });
  },
  clearAgentEditorData: () => set({ agentEditorPrefilledData: null, agentEditorTargetId: null }),
  setDraftChatConfig: (config) => set({ draftChatConfig: config }),
  clearDraftChatConfig: () => set({ draftChatConfig: null }),

  // Multi-model mode actions
  toggleMultiModelMode: (currentModelId) => {
    const state = get();
    if (state.isMultiModelMode) {
      // Turn off - reset panels
      set({ isMultiModelMode: false, multiModelPanels: [], activePanelId: null });
    } else {
      // Turn on - restore from localStorage or use defaults
      const defaultModelId = currentModelId || "openai/gpt-4o";
      const lastUsedModels = getLastUsedModels(defaultModelId);
      const panels: MultiModelPanel[] = lastUsedModels.slice(0, 2).map((modelId) => ({
        id: nanoid(),
        modelId,
        isCollapsed: false,
      }));
      set({ isMultiModelMode: true, multiModelPanels: panels, activePanelId: panels[0]?.id || null });
    }
  },

  addModelPanel: (modelId) => {
    const state = get();
    if (state.multiModelPanels.length >= 4) return; // Max 4 panels
    const newPanel = { id: nanoid(), modelId, isCollapsed: false };
    const newPanels = [...state.multiModelPanels, newPanel];
    set({ multiModelPanels: newPanels });
    // Save to localStorage
    saveLastUsedModels(newPanels.map((p) => p.modelId));
  },

  removeModelPanel: (panelId) => {
    const state = get();
    const newPanels = state.multiModelPanels.filter((p) => p.id !== panelId);
    // If only 1 panel left, turn off multi-model mode
    if (newPanels.length <= 1) {
      set({ isMultiModelMode: false, multiModelPanels: [], activePanelId: null });
    } else {
      // If removing active panel, switch to first available
      const newActiveId = state.activePanelId === panelId
        ? newPanels[0]?.id || null
        : state.activePanelId;
      set({ multiModelPanels: newPanels, activePanelId: newActiveId });
      saveLastUsedModels(newPanels.map((p) => p.modelId));
    }
  },

  updatePanelModel: (panelId, modelId) => {
    const state = get();
    const newPanels = state.multiModelPanels.map((p) =>
      p.id === panelId ? { ...p, modelId } : p
    );
    set({ multiModelPanels: newPanels });
    saveLastUsedModels(newPanels.map((p) => p.modelId));
  },

  resetMultiModelMode: () => {
    set({ isMultiModelMode: false, multiModelPanels: [], activePanelId: null });
  },

  setActivePanelId: (panelId) => set({ activePanelId: panelId }),

  togglePanelCollapse: (panelId) => {
    const state = get();
    const newPanels = state.multiModelPanels.map((p) =>
      p.id === panelId ? { ...p, isCollapsed: !p.isCollapsed } : p
    );
    set({ multiModelPanels: newPanels });
  },
}));
