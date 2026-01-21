"use client";

import { useMcpCleanup } from "@/hooks/use-mcp-cleanup";
import { useDBHealth } from "@/hooks/use-db-health";
import { useCacheCleanup } from "@/hooks/use-cache-cleanup";

/**
 * Client component to run global initialization hooks.
 * Add any app-wide lifecycle hooks here.
 */
export function GlobalHooks() {
  // Clear old caches and handle version migrations
  useCacheCleanup();

  // Monitor IndexedDB health and handle recovery scenarios
  useDBHealth();

  // Ensure MCP connections are cleaned up on page unload
  useMcpCleanup();

  // This component doesn't render anything
  return null;
}
