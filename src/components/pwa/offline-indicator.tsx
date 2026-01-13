"use client";

import { WifiOff } from "lucide-react";
import { usePWA } from "@/hooks/use-pwa";
import { cn } from "@/lib/utils";

interface OfflineIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function OfflineIndicator({
  className,
  showLabel = true,
}: OfflineIndicatorProps) {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400",
        className
      )}
    >
      <WifiOff className="h-3 w-3" />
      {showLabel && <span>Offline</span>}
    </div>
  );
}
