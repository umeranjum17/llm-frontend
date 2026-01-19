"use client";

import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[Error Boundary] Caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleClearCacheAndReload = async () => {
    try {
      // Clear all caches
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // Unregister service workers
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      // Clear sessionStorage and localStorage (optional, but helpful)
      sessionStorage.clear();
      
      // Reload the page
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
                  Lumina encountered an unexpected error. This is usually caused by a corrupted cache or outdated files.
                </p>
              </div>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Error Details (Development Only):
                </p>
                <pre className="text-xs text-muted-foreground overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                onClick={this.handleClearCacheAndReload}
                className="w-full"
                size="lg"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Clear Cache & Reload
              </Button>
              
              <div className="flex gap-2">
                <Button
                  onClick={this.handleReload}
                  variant="outline"
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload
                </Button>
                
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="flex-1"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </div>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              If this problem persists, try closing all Lumina tabs and reopening the app.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
