import { create } from "zustand";

interface TabsState {
  tabs: string[]; // Array of chat IDs
  activeTabId: string | null;
  
  // Actions
  addTab: (chatId: string) => void;
  removeTab: (chatId: string) => void;
  setActiveTab: (chatId: string) => void;
  closeTab: (chatId: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (chatId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (chatId: string) => {
    const { tabs } = get();
    if (!tabs.includes(chatId)) {
      set({ tabs: [...tabs, chatId], activeTabId: chatId });
    } else {
      set({ activeTabId: chatId });
    }
  },

  removeTab: (chatId: string) => {
    const { tabs, activeTabId } = get();
    const newTabs = tabs.filter((id) => id !== chatId);
    
    let newActiveTabId = activeTabId;
    if (activeTabId === chatId) {
      const currentIndex = tabs.indexOf(chatId);
      if (newTabs.length > 0) {
        // Switch to next tab, or previous if we removed the last one
        newActiveTabId = newTabs[Math.min(currentIndex, newTabs.length - 1)] || null;
      } else {
        newActiveTabId = null;
      }
    }
    
    set({ tabs: newTabs, activeTabId: newActiveTabId });
  },

  setActiveTab: (chatId: string) => {
    set({ activeTabId: chatId });
  },

  closeTab: (chatId: string) => {
    get().removeTab(chatId);
  },

  closeAllTabs: () => {
    set({ tabs: [], activeTabId: null });
  },

  closeOtherTabs: (chatId: string) => {
    set({ tabs: [chatId], activeTabId: chatId });
  },

  reorderTabs: (fromIndex: number, toIndex: number) => {
    const { tabs } = get();
    const newTabs = [...tabs];
    const [removed] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, removed);
    set({ tabs: newTabs });
  },
}));
