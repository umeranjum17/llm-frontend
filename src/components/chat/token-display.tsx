"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface TokenDisplayProps {
  historyTokens: number;
  draftTokens: number;
  totalTokens: number;
  modelName: string;
  className?: string;
}

function formatTokenCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

export function TokenDisplay({
  historyTokens,
  draftTokens,
  totalTokens,
  modelName,
  className,
}: TokenDisplayProps) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const usedTokens = historyTokens + draftTokens;
  const percentage = useMemo(() => {
    if (totalTokens === 0) return 0;
    return Math.min(100, (usedTokens / totalTokens) * 100);
  }, [usedTokens, totalTokens]);

  const statusColor = useMemo(() => {
    if (percentage >= 85) return "bg-destructive";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-primary/60";
  }, [percentage]);

  const warningMessage = useMemo(() => {
    if (percentage >= 95) return "Context nearly full - consider starting a new chat";
    if (percentage >= 85) return "Running low on context space";
    return null;
  }, [percentage]);

  // Close popup when clicking outside
  useEffect(() => {
    if (!showPopup) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPopup(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPopup]);

  if (totalTokens === 0) return null;

  return (
    <div className={cn("relative mb-2", className)}>
      {/* Compact full-width progress bar */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShowPopup(!showPopup)}
        className="w-full flex items-center gap-2 group cursor-pointer"
        aria-label={showPopup ? "Hide context details" : "Show context details"}
      >
        {/* Warning icon for high usage */}
        {percentage >= 70 && (
          <AlertTriangle className={cn(
            "h-3 w-3 shrink-0",
            percentage >= 85 ? "text-destructive" : "text-yellow-500"
          )} />
        )}

        {/* Progress bar */}
        <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-500", statusColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Compact stats */}
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {formatTokenCount(usedTokens)} / {formatTokenCount(totalTokens)}
        </span>
      </button>

      {/* Popup with details */}
      {showPopup && (
        <div
          ref={popupRef}
          className="absolute bottom-full left-0 right-0 mb-2 p-3 rounded-lg border bg-popover shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Context Usage</span>
              <span className="text-muted-foreground">{modelName}</span>
            </div>

            {/* Visual bar with segments */}
            <div className="h-2 bg-muted/60 rounded-full overflow-hidden">
              <div className="h-full flex">
                {/* History tokens segment */}
                <div
                  className="bg-primary/60 transition-all duration-300"
                  style={{ width: `${(historyTokens / totalTokens) * 100}%` }}
                />
                {/* Draft tokens segment */}
                <div
                  className="bg-primary/30 transition-all duration-300"
                  style={{ width: `${(draftTokens / totalTokens) * 100}%` }}
                />
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary/60" />
                <span className="text-muted-foreground">History:</span>
                <span className="font-medium tabular-nums">{formatTokenCount(historyTokens)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary/30" />
                <span className="text-muted-foreground">Draft:</span>
                <span className="font-medium tabular-nums">{formatTokenCount(draftTokens)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-muted" />
                <span className="text-muted-foreground">Available:</span>
                <span className="font-medium tabular-nums">{formatTokenCount(totalTokens - usedTokens)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Used:</span>
                <span className="font-medium tabular-nums">{Math.round(percentage)}%</span>
              </div>
            </div>

            {/* Warning message */}
            {warningMessage && (
              <div className={cn(
                "flex items-center gap-1.5 text-[11px] pt-1 border-t",
                percentage >= 85 ? "text-destructive" : "text-yellow-600"
              )}>
                <AlertTriangle className="h-3 w-3" />
                <span>{warningMessage}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
