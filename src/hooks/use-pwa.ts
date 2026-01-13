"use client";

import { useState, useEffect, useCallback } from "react";

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
}

interface UsePWAReturn extends PWAState {
  install: () => Promise<boolean>;
  update: () => void;
  dismissInstall: () => void;
}

export function usePWA(): UsePWAReturn {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

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
        const reg = await navigator.serviceWorker.ready;
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
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

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

  const update = useCallback(() => {
    if (!registration?.waiting) return;

    // Tell the waiting service worker to skip waiting
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }, [registration]);

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
    install,
    update,
    dismissInstall,
  };
}
