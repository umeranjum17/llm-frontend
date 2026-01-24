/**
 * Cloud Sync Initialization Hook
 *
 * Initializes cloud sync on app startup.
 * Should be called from GlobalHooks to ensure it runs on every page.
 */

import { useEffect, useRef, useState } from "react";

export function useCloudSyncInit() {
  const [isConfigured, setIsConfigured] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    // Only initialize once and only on client
    if (initialized.current || typeof window === "undefined") return;
    initialized.current = true;

    // Dynamically import the store to avoid SSR issues with AWS SDK
    import("@/stores/cloud-sync-store").then(({ useCloudSyncStore }) => {
      const { loadConfig, isConfigured: configured } = useCloudSyncStore.getState();
      setIsConfigured(configured);

      // Load cloud sync configuration
      // This will also start auto-sync if enabled
      loadConfig();
    });
  }, []);

  return { isConfigured };
}
