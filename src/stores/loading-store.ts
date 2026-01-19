import { create } from "zustand";

interface LoadingState {
  isPwaUpdating: boolean;
  pwaUpdateStatus?: "clearing-cache" | "updating" | "reloading" | "error";
  pwaUpdateMessage?: string;
  isDbInitializing: boolean;
  dbInitMessage?: string;
  isSidebarLoading: boolean;
  sidebarLoadMessage?: string;
  globalMessage?: string;
  
  // Actions
  setPwaUpdating: (updating: boolean, status?: "clearing-cache" | "updating" | "reloading" | "error", message?: string) => void;
  setDbInitializing: (initializing: boolean, message?: string) => void;
  setSidebarLoading: (loading: boolean, message?: string) => void;
  setGlobalMessage: (message?: string) => void;
  reset: () => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  isPwaUpdating: false,
  pwaUpdateStatus: undefined,
  pwaUpdateMessage: undefined,
  isDbInitializing: false,
  dbInitMessage: undefined,
  isSidebarLoading: false,
  sidebarLoadMessage: undefined,
  globalMessage: undefined,

  setPwaUpdating: (updating, status, message) => {
    set({
      isPwaUpdating: updating,
      pwaUpdateStatus: status,
      pwaUpdateMessage: message,
    });
  },

  setDbInitializing: (initializing, message) => {
    set({
      isDbInitializing: initializing,
      dbInitMessage: message,
    });
  },

  setSidebarLoading: (loading, message) => {
    set({
      isSidebarLoading: loading,
      sidebarLoadMessage: message,
    });
  },

  setGlobalMessage: (message) => {
    set({ globalMessage: message });
  },

  reset: () => {
    set({
      isPwaUpdating: false,
      pwaUpdateStatus: undefined,
      pwaUpdateMessage: undefined,
      isDbInitializing: false,
      dbInitMessage: undefined,
      isSidebarLoading: false,
      sidebarLoadMessage: undefined,
      globalMessage: undefined,
    });
  },
}));
