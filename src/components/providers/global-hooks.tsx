"use client";

import { useMcpCleanup } from "@/hooks/use-mcp-cleanup";
import { useDBHealth } from "@/hooks/use-db-health";

/**
 * Client component to run global initialization hooks.
 * Add any app-wide lifecycle hooks here.
 */
export function GlobalHooks() {
  // Monitor IndexedDB health and handle recovery scenarios
  useDBHealth();

  // Ensure MCP connections are cleaned up on page unload
  useMcpCleanup();

  // This component doesn't render anything
  return null;
}
