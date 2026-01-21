"use client";

import { useEffect, useRef } from "react";

const APP_VERSION = "2.1.0"; // Increment this when making breaking changes
const VERSION_KEY = "lumina-app-version";

/**
 * Hook to handle cache cleanup and version migrations.
 * Clears old caches when the app version changes.
 */
export function useCacheCleanup() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || hasRun.current) return;
    hasRun.current = true;

    const storedVersion = localStorage.getItem(VERSION_KEY);

    // If version changed or doesn't exist, clear caches
    if (storedVersion !== APP_VERSION) {
      console.log(
        `[CacheCleanup] Version change detected (${storedVersion || "none"} → ${APP_VERSION}), clearing caches...`
      );

      // Clear all streaming-related localStorage items
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.includes("streaming") ||
              key.includes("lumina-") ||
              key === "streaming-store-state")
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          console.log(`[CacheCleanup] Removing localStorage key: ${key}`);
          localStorage.removeItem(key);
        });
      } catch (error) {
        console.error("[CacheCleanup] Error clearing localStorage:", error);
      }

      // Clear all caches via Cache API
      if ("caches" in window) {
        caches
          .keys()
          .then((names) => {
            return Promise.all(
              names.map((name) => {
                console.log(`[CacheCleanup] Deleting cache: ${name}`);
                return caches.delete(name);
              })
            );
          })
          .then(() => {
            console.log("[CacheCleanup] All caches cleared");
          })
          .catch((error) => {
            console.error("[CacheCleanup] Error clearing caches:", error);
          });
      }

      // Force service worker update if available
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            registrations.forEach((registration) => {
              console.log("[CacheCleanup] Updating service worker...");
              registration.update();

              // If there's a waiting worker, skip waiting immediately
              if (registration.waiting) {
                console.log("[CacheCleanup] Activating waiting service worker...");
                registration.waiting.postMessage({ type: "SKIP_WAITING" });
              }
            });
          })
          .catch((error) => {
            console.error("[CacheCleanup] Error updating service worker:", error);
          });
      }

      // Update stored version
      localStorage.setItem(VERSION_KEY, APP_VERSION);

      console.log("[CacheCleanup] Cache cleanup complete");
    }
  }, []);
}
