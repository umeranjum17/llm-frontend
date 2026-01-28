"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpdateOverlayProps {
  isVisible: boolean;
  status?: "clearing-cache" | "updating" | "reloading" | "error";
  message?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

export function UpdateOverlay({ 
  isVisible, 
  status = "updating", 
  message,
  onRetry,
  onCancel
}: UpdateOverlayProps) {
  const [dots, setDots] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Animated dots for loading state
  useEffect(() => {
    if (!isVisible || status === "error") return;
    
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible, status]);

  // Track elapsed time
  useEffect(() => {
    if (!isVisible || status === "error") {
      setElapsedSeconds(0);
      return;
    }
    
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, status]);

  if (!isVisible) return null;

  const getStatusMessage = () => {
    if (message) return message;
    
    switch (status) {
      case "clearing-cache":
        return "Clearing old cache";
      case "updating":
        return "Installing update";
      case "reloading":
        return "Reloading app";
      case "error":
        return "Update failed";
      default:
        return "Updating";
    }
  };

  const showWarning = elapsedSeconds > 10 && status !== "error";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center gap-6 rounded-lg border bg-card p-8 shadow-2xl max-w-md mx-4">
        {status === "error" ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        ) : (
          <div className="relative">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-primary/60" />
            </div>
          </div>
        )}

        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">
            {status === "error" ? "Update Failed" : "Updating Lumina"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {getStatusMessage()}
            {status !== "error" && dots}
          </p>
          
          {showWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-4">
              This is taking longer than expected...
            </p>
          )}

          {elapsedSeconds > 0 && status !== "error" && (
            <p className="text-xs text-muted-foreground/60">
              {elapsedSeconds}s elapsed
            </p>
          )}
        </div>

        {status === "error" && (
          <div className="flex gap-2 w-full">
            {onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="flex-1"
              >
                Cancel
              </Button>
            )}
            {onRetry && (
              <Button
                onClick={onRetry}
                className="flex-1"
              >
                Try Again
              </Button>
            )}
          </div>
        )}

        {status !== "error" && !showWarning && (
          <p className="text-xs text-center text-muted-foreground/60 max-w-xs">
            Please do not close the app. This will only take a moment.
          </p>
        )}

        {showWarning && (
          <p className="text-xs text-center text-muted-foreground max-w-xs">
            Try closing all Lumina tabs and reopening the app for a cleaner update.
          </p>
        )}
      </div>
    </div>
  );
}
