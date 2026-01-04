import { create } from "zustand";

export interface Artifact {
  id: string;
  title: string;
  code: string;
  language: string;
}

interface UIState {
  sidebarCollapsed: boolean;
  activeChatId: string | null;
  commandPaletteOpen: boolean;
  modelPickerOpen: boolean;
  toolSelectorOpen: boolean;
  showArtifacts: boolean;
  activeArtifact: Artifact | null;
  isArenaMode: boolean;
  arenaModelIds: string[];

  // Actions
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveChatId: (chatId: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setModelPickerOpen: (open: boolean) => void;
  setToolSelectorOpen: (open: boolean) => void;
  setShowArtifacts: (show: boolean) => void;
  setActiveArtifact: (artifact: Artifact | null) => void;
  setIsArenaMode: (enabled: boolean) => void;
  setArenaModelIds: (ids: string[]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeChatId: null,
  commandPaletteOpen: false,
  modelPickerOpen: false,
  toolSelectorOpen: false,
  showArtifacts: false,
  activeArtifact: null,
  isArenaMode: false,
  arenaModelIds: [],

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setModelPickerOpen: (open) => set({ modelPickerOpen: open }),
  setToolSelectorOpen: (open) => set({ toolSelectorOpen: open }),
  setShowArtifacts: (show) => set({ showArtifacts: show }),
  setActiveArtifact: (artifact) => set({ activeArtifact: artifact }),
  setIsArenaMode: (enabled) => set({ isArenaMode: enabled }),
  setArenaModelIds: (ids) => set({ arenaModelIds: ids }),
}));
