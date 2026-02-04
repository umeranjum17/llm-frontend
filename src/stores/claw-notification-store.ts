import { create } from "zustand";

export interface ClawNotification {
  id: string;
  type:
    | "task:completed"
    | "task:failed"
    | "activity:new"
    | "schedule:triggered"
    | "keys:synced"
    | "initiative:proposed"
    | "initiative:approved"
    | "initiative:rejected"
    | "initiative:deferred";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

interface ClawNotificationState {
  notifications: ClawNotification[];
  addNotification: (
    n: Omit<ClawNotification, "id" | "timestamp" | "read">,
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

export const useClawNotificationStore = create<ClawNotificationState>(
  (set) => ({
    notifications: [],

    addNotification: (n) =>
      set((state) => ({
        notifications: [
          { ...n, id: crypto.randomUUID(), timestamp: Date.now(), read: false },
          ...state.notifications,
        ].slice(0, MAX_NOTIFICATIONS),
      })),

    markAsRead: (id) =>
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
      })),

    markAllAsRead: () =>
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      })),

    clearAll: () => set({ notifications: [] }),
  }),
);

export const useUnreadCount = () =>
  useClawNotificationStore(
    (state) => state.notifications.filter((n) => !n.read).length,
  );

// Count proposed initiatives that need attention (computed from claw-store)
export const useAttentionCount = () => {
  // Import dynamically to avoid circular dependency
  const { useClawStore } = require("@/stores/claw-store");
  return useClawStore((s: { initiatives: Array<{ status: string }> }) =>
    s.initiatives.filter((i) => i.status === "proposed").length
  );
};
