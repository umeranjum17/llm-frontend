"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

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
  const [expanded, setExpanded] = useState(false);
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

  if (totalTokens === 0) return null;

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      {/* Minimal bar - clickable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 group cursor-pointer"
        aria-label={expanded ? "Hide context details" : "Show context details"}
      >
        <div className="h-1 w-12 sm:w-16 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-500", statusColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {formatTokenCount(usedTokens)} / {formatTokenCount(totalTokens)} ({Math.round(percentage)}%)
        </div>
      )}
    </div>
  );
}
