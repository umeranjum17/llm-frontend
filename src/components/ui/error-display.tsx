"use client";

import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  variant?: "default" | "destructive" | "warning";
}

export function ErrorDisplay({
  title = "Something went wrong",
  message,
  onRetry,
  onDismiss,
  className,
  variant = "default",
}: ErrorDisplayProps) {
  const getErrorSuggestion = (msg: string): string | null => {
    const lower = msg.toLowerCase();
    if (lower.includes("api key") || lower.includes("authentication") || lower.includes("unauthorized")) {
      return "Check your API key in Settings > API Keys";
    }
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection")) {
      return "Check your internet connection and try again";
    }
    if (lower.includes("rate limit") || lower.includes("quota")) {
      return "You've hit a rate limit. Please wait a moment and try again";
    }
    if (lower.includes("model") || lower.includes("not found")) {
      return "The selected model may not be available. Try selecting a different model";
    }
    return null;
  };

  const suggestion = getErrorSuggestion(message);

  return (
    <Alert
      variant={variant === "destructive" ? "destructive" : "default"}
      className={cn("border-2", className)}
    >
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-2">{message}</p>
        {suggestion && (
          <p className="text-sm text-muted-foreground italic">
            💡 {suggestion}
          </p>
        )}
        {(onRetry || onDismiss) && (
          <div className="flex gap-2 mt-4">
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="gap-2"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="gap-2"
              >
                <X className="h-3 w-3" />
                Dismiss
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
