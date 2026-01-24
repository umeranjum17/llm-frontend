"use client";

import { useComposioCleanup } from "@/hooks/use-composio-cleanup";
import { useDBHealth } from "@/hooks/use-db-health";
import { useCacheCleanup } from "@/hooks/use-cache-cleanup";
import { useCloudSyncInit } from "@/hooks/use-cloud-sync-init";

/**
 * Client component to run global initialization hooks.
 * Add any app-wide lifecycle hooks here.
 */
export function GlobalHooks() {
  // Clear old caches and handle version migrations
  useCacheCleanup();

  // Monitor IndexedDB health and handle recovery scenarios
  useDBHealth();

  // Ensure Composio connections are cleaned up on page unload
  useComposioCleanup();

  // Initialize cloud sync (loads config, starts auto-sync if enabled)
  useCloudSyncInit();

  // This component doesn't render anything
  return null;
}
