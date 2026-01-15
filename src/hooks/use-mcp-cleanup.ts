"use client";

import { useEffect } from "react";
import { McpManager } from "@/lib/mcp/mcp-manager";

/**
 * Hook to ensure MCP connections are properly cleaned up on page unload.
 * Use this in the root layout or app provider to ensure cleanup happens.
 */
export function useMcpCleanup() {
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        McpManager.getInstance().cleanup();
      } catch (error) {
        console.warn("[MCP Cleanup] Error during cleanup:", error);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Also cleanup on unmount (e.g., hot reload during development)
      try {
        McpManager.getInstance().cleanup();
      } catch (error) {
        console.warn("[MCP Cleanup] Error during unmount cleanup:", error);
      }
    };
  }, []);
}
