/**
 * Cross-tab coordination using BroadcastChannel API.
 * Provides instant messaging between tabs for cache invalidation,
 * chat deletion notifications, and PWA update coordination.
 */

type MessageHandler = (data: unknown) => void;

/**
 * Message types for cross-tab communication
 */
export const CrossTabMessages = {
  /** Notify other tabs that cache was invalidated */
  CACHE_INVALIDATED: "cache_invalidated",
  /** Notify other tabs that a chat was deleted */
  CHAT_DELETED: "chat_deleted",
  /** Notify other tabs that a chat was updated */
  CHAT_UPDATED: "chat_updated",
  /** Notify other tabs that DB version changed */
  DB_VERSION_CHANGED: "db_version_changed",
  /** Notify other tabs that PWA update started */
  PWA_UPDATE_STARTED: "pwa_update_started",
  /** Notify other tabs that PWA update completed */
  PWA_UPDATE_COMPLETE: "pwa_update_complete",
} as const;

export type CrossTabMessageType = (typeof CrossTabMessages)[keyof typeof CrossTabMessages];

interface CrossTabMessage {
  type: string;
  data?: unknown;
  tabId: string;
  timestamp: number;
}

class CrossTabCoordinator {
  private channel: BroadcastChannel | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private tabId = typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36);

  constructor(channelName: string = "lumina-cross-tab") {
    // Only initialize in browser environment with BroadcastChannel support
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return;
    }

    try {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = this.handleMessage.bind(this);
      this.channel.onmessageerror = (event) => {
        console.warn("[CrossTab] Message error:", event);
      };
    } catch (error) {
      console.warn("[CrossTab] Failed to create BroadcastChannel:", error);
    }
  }

  private handleMessage(event: MessageEvent<CrossTabMessage>) {
    const { type, data, tabId } = event.data;

    // Ignore messages from this tab
    if (tabId === this.tabId) {
      return;
    }

    // Dispatch to registered handlers
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[CrossTab] Handler error for ${type}:`, error);
        }
      });
    }
  }

  /**
   * Broadcast a message to all other tabs
   */
  broadcast(type: string, data?: unknown): void {
    if (!this.channel) return;

    try {
      const message: CrossTabMessage = {
        type,
        data,
        tabId: this.tabId,
        timestamp: Date.now(),
      };
      this.channel.postMessage(message);
    } catch (error) {
      console.warn("[CrossTab] Failed to broadcast:", error);
    }
  }

  /**
   * Register a handler for a specific message type.
   * Returns an unsubscribe function.
   */
  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => this.off(type, handler);
  }

  /**
   * Unregister a handler
   */
  off(type: string, handler: MessageHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  /**
   * Get this tab's unique ID
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Check if BroadcastChannel is supported and active
   */
  isActive(): boolean {
    return this.channel !== null;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.handlers.clear();
    this.channel?.close();
    this.channel = null;
  }
}

// Singleton instance - lazily initialized
let coordinator: CrossTabCoordinator | null = null;

/**
 * Get the singleton CrossTabCoordinator instance.
 * Safe to call in SSR - returns a no-op coordinator.
 */
export function getCrossTabCoordinator(): CrossTabCoordinator {
  if (!coordinator) {
    coordinator = new CrossTabCoordinator();
  }
  return coordinator;
}

/**
 * Convenience function to broadcast a message
 */
export function broadcastToTabs(type: CrossTabMessageType, data?: unknown): void {
  getCrossTabCoordinator().broadcast(type, data);
}

/**
 * Convenience function to listen for messages
 */
export function onCrossTabMessage(type: CrossTabMessageType, handler: MessageHandler): () => void {
  return getCrossTabCoordinator().on(type, handler);
}
