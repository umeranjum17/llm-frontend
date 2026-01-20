"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLoadingStore } from "@/stores/loading-store";
import { withTimeoutSafe } from "@/lib/utils/async-timeout";
import { toast } from "sonner";

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

    // Listen for controller change (after update activates)
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;

      // Show reloading status briefly then reload
      setPwaUpdating(true, "reloading", "Reloading application");
      setIsUpdating(true);

      // Small delay to ensure the overlay is visible
      setTimeout(() => {
        window.location.reload();
      }, 300);
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

    // Check if DB is currently initializing to prevent race conditions
    const { isDbInitializing } = useLoadingStore.getState();
    if (isDbInitializing) {
      console.log("[PWA] DB initialization in progress, deferring update");
      toast.info("Update will apply after database initialization completes.", {
        duration: 5000,
      });
      return;
    }

    try {
      setIsUpdating(true);
      setPwaUpdating(true, "updating", "Installing update...");

      // Tell the waiting SW to activate
      // The controllerchange event will trigger the reload
      registration.waiting.postMessage({ type: "SKIP_WAITING" });

      // Set timeout in case SW doesn't activate
      updateTimeoutRef.current = setTimeout(() => {
        console.warn("[PWA] Update taking longer than expected");
        setPwaUpdating(
          true,
          "error",
          "Update is taking too long. Please refresh manually."
        );
        setIsUpdating(false);
      }, 10000);
    } catch (error) {
      console.error("[PWA] Update failed:", error);
      setPwaUpdating(
        true,
        "error",
        "Update failed. Please refresh manually."
      );
      setIsUpdating(false);

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
