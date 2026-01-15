"use client";

import { useMcpCleanup } from "@/hooks/use-mcp-cleanup";

/**
 * Client component to run global initialization hooks.
 * Add any app-wide lifecycle hooks here.
 */
export function GlobalHooks() {
  // Ensure MCP connections are cleaned up on page unload
  useMcpCleanup();

  // This component doesn't render anything
  return null;
}
