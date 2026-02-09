import { create } from "zustand";
import { useLuminaPreferencesStore } from "./lumina-preferences-store";

export interface LuminaNotification {
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
    | "initiative:deferred"
    | "monitor:alert"
    | "approval:requested"
    | "approval:timeout";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  count?: number; // For batched notifications
}

const MAX_NOTIFICATIONS = 50;

// Deduplication and batching constants
const DEDUPE_WINDOW_MS = 60_000;
const BATCH_WINDOW_MS = 2_000;
const DEDUPE_TYPES: Set<LuminaNotification["type"]> = new Set(["keys:synced", "schedule:triggered"]);
const BATCH_TYPES: Set<LuminaNotification["type"]> = new Set(["activity:new"]);

// Notification level filtering sets
const IMPORTANT_TYPES: Set<LuminaNotification["type"]> = new Set(["task:completed", "task:failed", "initiative:proposed", "monitor:alert"]);
const MINIMAL_TYPES: Set<LuminaNotification["type"]> = new Set(["task:failed", "initiative:proposed", "monitor:alert"]);

// Module-level state for deduplication and batching
let lastEmitByType: Record<string, number> = {};
let pendingBatch: Map<string, { title: string; messages: string[] }> = new Map();
let batchTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

interface LuminaNotificationState {
  notifications: LuminaNotification[];
  addNotification: (
    n: Omit<LuminaNotification, "id" | "timestamp" | "read" | "count">,
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  _resetDedupState?: () => void; // For testing only
}

export const useLuminaNotificationStore = create<LuminaNotificationState>(
  (set, get) => ({
    notifications: [],

    addNotification: (n) => {
      // Filter based on notification level preference
      const level = useLuminaPreferencesStore.getState().notificationLevel;

      if (level === 'none') return;
      if (level === 'minimal' && !MINIMAL_TYPES.has(n.type)) return;
      if (level === 'important' && !IMPORTANT_TYPES.has(n.type)) return;

      const now = Date.now();
      const type = n.type;

      // Handle deduplication for specific types
      if (DEDUPE_TYPES.has(type)) {
        const lastEmit = lastEmitByType[type];
        if (lastEmit && now - lastEmit < DEDUPE_WINDOW_MS) {
          // Skip this notification, within dedupe window
          return;
        }
        lastEmitByType[type] = now;
      }

      // Handle batching for specific types
      if (BATCH_TYPES.has(type)) {
        // Add to pending batch
        const existing = pendingBatch.get(type);
        if (existing) {
          existing.messages.push(n.message);
        } else {
          pendingBatch.set(type, { title: n.title, messages: [n.message] });
        }

        // Clear existing timeout if any
        const existingTimeout = batchTimeouts.get(type);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Set new timeout to flush batch
        const timeout = setTimeout(() => {
          const batch = pendingBatch.get(type);
          if (batch) {
            const count = batch.messages.length;
            const notification: LuminaNotification = {
              id: crypto.randomUUID(),
              type: type as LuminaNotification["type"],
              title: count > 1 ? `${count} new activities` : batch.title,
              message: count > 1 ? batch.messages.join(", ") : batch.messages[0],
              timestamp: Date.now(),
              read: false,
              ...(count > 1 ? { count } : {}),
            };

            set((state) => ({
              notifications: [notification, ...state.notifications].slice(
                0,
                MAX_NOTIFICATIONS,
              ),
            }));

            pendingBatch.delete(type);
            batchTimeouts.delete(type);
          }
        }, BATCH_WINDOW_MS);

        batchTimeouts.set(type, timeout);
        lastEmitByType[type] = now;
        return;
      }

      // Regular notification - add immediately
      lastEmitByType[type] = now;
      set((state) => ({
        notifications: [
          { ...n, id: crypto.randomUUID(), timestamp: Date.now(), read: false },
          ...state.notifications,
        ].slice(0, MAX_NOTIFICATIONS),
      }));
    },

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

    clearAll: () => {
      batchTimeouts.forEach((timeout) => clearTimeout(timeout));
      batchTimeouts.clear();
      pendingBatch.clear();
      set({ notifications: [] });
    },

    // Reset dedup state for testing
    _resetDedupState: () => {
      lastEmitByType = {};
      pendingBatch.clear();
      batchTimeouts.forEach((timeout) => clearTimeout(timeout));
      batchTimeouts.clear();
    },
  }),
);

export const useUnreadCount = () =>
  useLuminaNotificationStore(
    (state) => state.notifications.filter((n) => !n.read).length,
  );

// Count proposed initiatives that need attention (computed from lumina-store)
export const useAttentionCount = () => {
  // Import dynamically to avoid circular dependency
  const { useLuminaStore } = require("@/stores/lumina-store");
  return useLuminaStore((s: { initiatives: Array<{ status: string }> }) =>
    s.initiatives.filter((i) => i.status === "proposed").length
  );
};
