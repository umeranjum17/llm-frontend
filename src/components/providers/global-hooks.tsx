"use client";

import { useEffect } from "react";
import { useComposioCleanup } from "@/hooks/use-composio-cleanup";
import { useDBHealth } from "@/hooks/use-db-health";
import { useCacheCleanup } from "@/hooks/use-cache-cleanup";
import { useSyncInit } from "@/hooks/use-sync-init";
import { useAutoSync } from "@/hooks/use-auto-sync";
import { useLuminaEvents } from "@/hooks/use-lumina-events";

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

  // Initialize delta sync change tracking
  useSyncInit();

  // Auto-sync on focus or interval (if enabled)
  useAutoSync();

  // Subscribe to Lumina SSE events for real-time notifications (no-op when Lumina is disabled)
  useLuminaEvents();

  // Localhost recovery: stale Workbox state can trap requests behind old CSP/network rules.
  useEffect(() => {
    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocalhost || !("serviceWorker" in navigator)) return;

    const key = "lumina_localhost_sw_reset_v1";
    if (sessionStorage.getItem(key) === "1") return;

    (async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length === 0) return;

      await Promise.allSettled(regs.map((reg) => reg.unregister()));
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.allSettled(names.map((name) => caches.delete(name)));
      }

      sessionStorage.setItem(key, "1");
      window.location.reload();
    })().catch((err) => {
      console.warn("[PWA] Localhost SW reset failed:", err);
    });
  }, []);

  // This component doesn't render anything
  return null;
}
