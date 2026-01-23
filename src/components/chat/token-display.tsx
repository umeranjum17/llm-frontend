"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface TokenDisplayProps {
  historyTokens: number;
  draftTokens: number;
  totalTokens: number;
  modelName: string;
  className?: string;
}

export function TokenDisplay({
  historyTokens,
  draftTokens,
  totalTokens,
  className,
}: TokenDisplayProps) {
  const usedTokens = historyTokens + draftTokens;
  const percentage = useMemo(() => {
    if (totalTokens === 0) return 0;
    return Math.min(100, (usedTokens / totalTokens) * 100);
  }, [usedTokens, totalTokens]);

  const statusColor = useMemo(() => {
    if (percentage >= 85) return "bg-destructive";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-primary";
  }, [percentage]);

  const textColor = useMemo(() => {
    if (percentage >= 85) return "text-destructive";
    if (percentage >= 70) return "text-yellow-600 dark:text-yellow-500";
    return "text-muted-foreground";
  }, [percentage]);

  if (totalTokens === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-[10px] sm:text-xs transition-colors",
        className
      )}
    >
      <div className="h-1.5 w-16 sm:w-20 bg-muted/50 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500", statusColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={cn("font-medium tabular-nums", textColor)}>
        {Math.round(percentage)}%
      </span>
    </div>
  );
}
