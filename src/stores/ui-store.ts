import { create } from "zustand";
import type { Skill, Agent } from "@/lib/db/schema";

export interface Artifact {
  id: string;
  title: string;
  code: string; // Main code or readme
  language: string;
  type: 'code' | 'image' | 'video' | 'html' | 'markdown' | 'csv' | 'sheet' | 'chart' | 'docx' | 'project';
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

interface UIState {
  sidebarCollapsed: boolean;
  activeChatId: string | null;
  secondaryChatId: string | null; // For split view
  isSplitView: boolean;
  commandPaletteOpen: boolean;
  modelPickerOpen: boolean;
  toolSelectorOpen: boolean;
  showArtifacts: boolean;
  activeArtifact: Artifact | null;
  artifactTabs: Artifact[]; // Multi-artifact tabs
  isArenaMode: boolean;
  arenaModelIds: string[];
  isFocusMode: boolean;
  artifactsFullscreen: boolean;
  skillEditorOpen: boolean;
  skillEditorPrefilledData: Partial<Skill> | null;
  skillEditorTargetId: string | null; // ID of skill to edit (for edit flows)
  agentEditorOpen: boolean;
  agentEditorPrefilledData: Partial<Agent> | null;
  agentEditorTargetId: string | null; // ID of agent to edit (for edit flows)
  draftChatConfig: DraftChatConfig | null; // Config for draft chat (when activeChatId is null)

  // Actions
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveChatId: (chatId: string | null) => void;
  setSecondaryChatId: (chatId: string | null) => void;
  setIsSplitView: (enabled: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setModelPickerOpen: (open: boolean) => void;
  setToolSelectorOpen: (open: boolean) => void;
  setShowArtifacts: (show: boolean) => void;
  setActiveArtifact: (artifact: Artifact | null) => void;
  addArtifactTab: (artifact: Artifact) => void;
  removeArtifactTab: (id: string) => void;
  clearArtifactTabs: () => void;
  setIsArenaMode: (enabled: boolean) => void;
  setArenaModelIds: (ids: string[]) => void;
  setIsFocusMode: (enabled: boolean) => void;
  setArtifactsFullscreen: (fullscreen: boolean) => void;
  setSkillEditorOpen: (open: boolean) => void;
  openSkillEditorWithData: (data: Partial<Skill>, targetId?: string | null) => void;
  clearSkillEditorData: () => void;
  setAgentEditorOpen: (open: boolean) => void;
  openAgentEditorWithData: (data: Partial<Agent>, targetId?: string | null) => void;
  clearAgentEditorData: () => void;
  setDraftChatConfig: (config: DraftChatConfig | null) => void;
  clearDraftChatConfig: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  activeChatId: null,
  secondaryChatId: null,
  isSplitView: false,
  commandPaletteOpen: false,
  modelPickerOpen: false,
  toolSelectorOpen: false,
  showArtifacts: false,
  activeArtifact: null,
  artifactTabs: [],
  isArenaMode: false,
  arenaModelIds: [],
  isFocusMode: false,
  artifactsFullscreen: false,
  skillEditorOpen: false,
  skillEditorPrefilledData: null,
  skillEditorTargetId: null,
  agentEditorOpen: false,
  agentEditorPrefilledData: null,
  agentEditorTargetId: null,
  draftChatConfig: null,

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
  setSecondaryChatId: (chatId) => set({ secondaryChatId: chatId }),
  setIsSplitView: (enabled) => set({ isSplitView: enabled }),
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
  setIsArenaMode: (enabled) => set({ isArenaMode: enabled }),
  setArenaModelIds: (ids) => set({ arenaModelIds: ids }),
  setIsFocusMode: (enabled) => set({ isFocusMode: enabled }),
  setArtifactsFullscreen: (fullscreen) => set({ artifactsFullscreen: fullscreen }),
  setSkillEditorOpen: (open) => set({ skillEditorOpen: open }),
  openSkillEditorWithData: (data, targetId) => {
    set({ 
      skillEditorOpen: true, 
      skillEditorPrefilledData: data,
      skillEditorTargetId: targetId || null
    });
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
}));
