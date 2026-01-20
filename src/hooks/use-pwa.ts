"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLoadingStore } from "@/stores/loading-store";
import { withTimeout, withTimeoutSafe } from "@/lib/utils/async-timeout";
import { operationMutex, LockKeys } from "@/lib/utils/operation-mutex";
import { broadcastToTabs, CrossTabMessages } from "@/lib/utils/cross-tab";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  isUpdateAvailable: boolean;
  isUpdating: boolean;
}

interface UsePWAReturn extends PWAState {
  install: () => Promise<boolean>;
  update: () => Promise<void>;
  dismissInstall: () => void;
}

export function usePWA(): UsePWAReturn {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const setPwaUpdating = useLoadingStore((state) => state.setPwaUpdating);

  // Check if already installed (standalone mode)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    setIsInstalled(isStandalone);
    setIsOnline(navigator.onLine);
  }, []);

  // Listen for install prompt
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Listen for online/offline status
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Listen for service worker updates
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    const checkForUpdates = async () => {
      try {
        // Add timeout to prevent indefinite hang if service worker never becomes ready
        const reg = await withTimeoutSafe(
          navigator.serviceWorker.ready,
          10000,
          "Service worker ready"
        );

        if (!reg) {
          console.warn("[PWA] Service worker ready timed out");
          return;
        }

        setRegistration(reg);

        // Check for waiting worker (update available)
        if (reg.waiting) {
          setIsUpdateAvailable(true);
        }

        // Listen for new updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setIsUpdateAvailable(true);
            }
          });
        });
      } catch {
        // Service worker not supported or not registered
      }
    };

    checkForUpdates();

    // Listen for controller change (after update)
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;

      // Notify other tabs that update is complete
      broadcastToTabs(CrossTabMessages.PWA_UPDATE_COMPLETE);

      // Show reloading status
      setPwaUpdating(true, "reloading", "Reloading application");
      setIsUpdating(true);

      // Small delay to ensure the overlay is visible
      setTimeout(() => {
        window.location.reload();
      }, 100);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [setPwaUpdating]);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        setIsInstalled(true);
        setIsInstallable(false);
      }

      setDeferredPrompt(null);
      return outcome === "accepted";
    } catch {
      return false;
    }
  }, [deferredPrompt]);

  const update = useCallback(async () => {
    if (!registration?.waiting) return;

    // Acquire mutex to prevent concurrent update operations
    const release = await operationMutex.acquire(LockKeys.SERVICE_WORKER_UPDATE);

    try {
      setIsUpdating(true);

      // Notify other tabs that update is starting
      broadcastToTabs(CrossTabMessages.PWA_UPDATE_STARTED);

      // Step 1: Clear caches with mutex protection and timeouts
      setPwaUpdating(true, "clearing-cache", "Clearing old cache");

      if ("caches" in window) {
        const cacheNames = await withTimeout(
          caches.keys(),
          5000,
          "Get cache names"
        ).catch(() => [] as string[]);

        // Clear in batches of 3 to avoid overwhelming the system
        const batchSize = 3;
        for (let i = 0; i < cacheNames.length; i += batchSize) {
          const batch = cacheNames.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (cacheName) => {
              try {
                await withTimeout(
                  caches.delete(cacheName),
                  5000,
                  `Delete cache ${cacheName}`
                );
                console.log("[PWA] Cleared cache:", cacheName);
              } catch (error) {
                console.warn(`[PWA] Failed to clear cache ${cacheName}:`, error);
                // Continue with other caches
              }
            })
          );
        }
      }

      // Small delay to show the clearing cache message
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 2: Send skip waiting message
      setPwaUpdating(true, "updating", "Installing new version");
      registration.waiting.postMessage({ type: "SKIP_WAITING" });

      // Set timeout for update process (30 seconds with warning)
      updateTimeoutRef.current = setTimeout(() => {
        console.warn("[PWA] Update taking longer than expected");
        setPwaUpdating(true, "updating", "Still updating... please wait");

        // Secondary timeout at 60s - give up and offer manual refresh
        setTimeout(() => {
          console.error("[PWA] Update timeout - offering manual refresh");
          setPwaUpdating(
            true,
            "error",
            "Update is taking too long. Please refresh manually."
          );
          setIsUpdating(false);
          release();
        }, 30000);
      }, 30000);
    } catch (error) {
      console.error("[PWA] Update failed:", error);
      setPwaUpdating(
        true,
        "error",
        "Update failed. Please try refreshing manually."
      );
      setIsUpdating(false);
      release();

      // Auto-hide error after 5 seconds
      setTimeout(() => {
        setPwaUpdating(false);
      }, 5000);
    }
  }, [registration, setPwaUpdating]);

  const dismissInstall = useCallback(() => {
    setIsInstallable(false);
    setDeferredPrompt(null);
    // Store dismissal in localStorage to avoid showing again this session
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pwa-install-dismissed", "true");
    }
  }, []);

  return {
    isInstallable:
      isInstallable &&
      !sessionStorage?.getItem?.("pwa-install-dismissed") &&
      !isInstalled,
    isInstalled,
    isOnline,
    isUpdateAvailable,
    isUpdating,
    install,
    update,
    dismissInstall,
  };
}
