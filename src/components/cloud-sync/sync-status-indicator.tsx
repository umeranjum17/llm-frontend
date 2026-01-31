"use client";

import { useEffect } from "react";
import { Cloud, CloudOff, Loader2, AlertCircle, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useCloudSyncStatus } from "@/hooks/use-cloud-sync";
import { cn } from "@/lib/utils";

interface SyncStatusIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function SyncStatusIndicator({
  className,
  showLabel = false,
}: SyncStatusIndicatorProps) {
  const {
    isConfigured,
    isEnabled,
    status,
    isSyncing,
    hasError,
    tooltipText,
    syncNow,
  } = useCloudSyncStatus();

  // Don't show anything if not configured
  if (!isConfigured) {
    return null;
  }

  // Don't show if disabled (optional - could show grayed out instead)
  if (!isEnabled) {
    return null;
  }

  const getIcon = () => {
    if (isSyncing) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (hasError) {
      return <AlertCircle className="h-4 w-4" />;
    }
    if (status === "connected") {
      return <Cloud className="h-4 w-4" />;
    }
    return <CloudOff className="h-4 w-4" />;
  };

  const getStatusColor = () => {
    if (isSyncing) return "text-blue-500";
    if (hasError) return "text-red-500";
    if (status === "connected") return "text-green-500";
    return "text-muted-foreground";
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 hover:bg-transparent",
              getStatusColor(),
              className
            )}
            onClick={() => {
              if (!isSyncing) {
                syncNow();
              }
            }}
            disabled={isSyncing}
          >
            {getIcon()}
            {showLabel && (
              <span className="ml-2 text-xs">
                {isSyncing ? "Syncing..." : "Synced"}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <p className="text-sm">{tooltipText()}</p>
          {!isSyncing && (
            <p className="text-xs text-muted-foreground mt-1">
              Click to sync now
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact sync indicator for tight spaces (just the icon with color)
 */
export function SyncStatusDot({ className }: { className?: string }) {
  const { isConfigured, isEnabled, isSyncing, hasError, status } =
    useCloudSyncStatus();

  if (!isConfigured || !isEnabled) {
    return null;
  }

  const getColor = () => {
    if (isSyncing) return "bg-blue-500";
    if (hasError) return "bg-red-500";
    if (status === "connected") return "bg-green-500";
    return "bg-muted-foreground";
  };

  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        getColor(),
        isSyncing && "animate-pulse",
        className
      )}
    />
  );
}
