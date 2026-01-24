"use client";

import { useEffect } from "react";
import { ComposioToolExecutor } from "@/lib/composio/composio-tool-executor";

/**
 * Hook to ensure Composio connections are properly cleaned up on page unload.
 * Use this in the root layout or app provider to ensure cleanup happens.
 */
export function useComposioCleanup() {
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        ComposioToolExecutor.getInstance().cleanup();
      } catch (error) {
        console.warn("[Composio Cleanup] Error during cleanup:", error);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Also cleanup on unmount (e.g., hot reload during development)
      try {
        ComposioToolExecutor.getInstance().cleanup();
      } catch (error) {
        console.warn("[Composio Cleanup] Error during unmount cleanup:", error);
      }
    };
  }, []);
}
