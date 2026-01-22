"use client";

import React from "react";
import { AlertTriangle, RefreshCw, Home, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  updateAvailable: boolean;
  isUpdating: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private registration: ServiceWorkerRegistration | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, updateAvailable: false, isUpdating: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Error Boundary] Caught error:", error, errorInfo);
    this.setState({ errorInfo });
    // Check for updates when an error occurs
    this.checkForUpdates();
  }

  checkForUpdates = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    try {
      // Force check for new service worker
      const reg = await navigator.serviceWorker.ready;
      this.registration = reg;

      // Trigger update check
      await reg.update();

      // Check if there's a waiting worker
      if (reg.waiting) {
        this.setState({ updateAvailable: true });
      }

      // Listen for new updates
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            this.setState({ updateAvailable: true });
          }
        });
      });
    } catch (err) {
      console.warn("[Error Boundary] Failed to check for updates:", err);
    }
  };

  handleUpdate = async () => {
    if (!this.registration?.waiting) {
      // No waiting worker, just reload
      window.location.reload();
      return;
    }

    this.setState({ isUpdating: true });

    // Listen for controller change to reload
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

    // Tell the waiting SW to activate
    this.registration.waiting.postMessage({ type: "SKIP_WAITING" });

    // Fallback reload after 5 seconds if SW doesn't activate
    setTimeout(() => {
      window.location.reload();
    }, 5000);
  };

  handleClearCacheAndReload = async () => {
    try {
      console.log("[Error Boundary] Starting comprehensive cache clear...");

      // 1. Clear all browser caches
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        console.log("[Error Boundary] Deleting caches:", cacheNames);
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // 2. Unregister all service workers
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        console.log("[Error Boundary] Unregistering service workers:", registrations.length);
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      // 3. Clear all storage (but preserve critical keys)
      sessionStorage.clear();

      // Clear localStorage except IndexedDB-related keys
      const keysToPreserve: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("fireproof") || key.startsWith("idb"))) {
          keysToPreserve.push(key);
        }
      }

      const preservedData = keysToPreserve.map(key => ({
        key,
        value: localStorage.getItem(key)
      }));

      localStorage.clear();

      // Restore preserved keys
      preservedData.forEach(({ key, value }) => {
        if (value) localStorage.setItem(key, value);
      });

      console.log("[Error Boundary] Cleared storage (preserved IndexedDB-related keys)");

      console.log("[Error Boundary] Cache clear complete, reloading...");

      // 4. Force reload with cache bypass
      window.location.reload();
    } catch (error) {
      console.error("[Error Boundary] Failed to clear cache:", error);
      // Force reload anyway
      window.location.reload();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-lg w-full space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold">Something went wrong</h1>
                <p className="text-muted-foreground">
                  {this.state.updateAvailable
                    ? "A new version is available. Update to fix this issue."
                    : "Lumina encountered an unexpected error. Try reloading the page."}
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Error Details:
                </p>
                <pre className="text-xs text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap break-all">
                  {this.state.error.toString()}
                  {this.state.error.message && `\n\nMessage: ${this.state.error.message}`}
                  {(this.state.error as any).digest && `\n\nDigest: ${(this.state.error as any).digest}`}
                </pre>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Stack trace</summary>
                  <pre className="mt-2 text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap break-all">
                    {this.state.error.stack}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {this.state.updateAvailable ? (
                <Button
                  onClick={this.handleUpdate}
                  className="w-full"
                  size="lg"
                  variant="default"
                  disabled={this.state.isUpdating}
                >
                  {this.state.isUpdating ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {this.state.isUpdating ? "Updating..." : "Update & Reload"}
                </Button>
              ) : (
                <Button
                  onClick={this.handleReload}
                  className="w-full"
                  size="lg"
                  variant="default"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload Page
                </Button>
              )}

              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="w-full"
              >
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Button>

              <details className="text-center">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Still not working? Try clearing cache
                </summary>
                <div className="mt-3 space-y-2">
                  <Button
                    onClick={this.handleClearCacheAndReload}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    Clear Cache & Reload
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    This clears cached files but keeps your chats safe.
                  </p>
                </div>
              </details>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              If this keeps happening, try closing all Lumina tabs and reopening.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
