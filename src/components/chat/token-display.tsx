"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatTokenCount } from "@/lib/utils/token-counter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  modelName,
  className,
}: TokenDisplayProps) {
  const usedTokens = historyTokens + draftTokens;
  const percentage = useMemo(() => {
    if (totalTokens === 0) return 0;
    return Math.min(100, (usedTokens / totalTokens) * 100);
  }, [usedTokens, totalTokens]);

  const historyPercentage = useMemo(() => {
    if (totalTokens === 0) return 0;
    return Math.min(100, (historyTokens / totalTokens) * 100);
  }, [historyTokens, totalTokens]);

  const draftPercentage = useMemo(() => {
    if (totalTokens === 0) return 0;
    return Math.min(100 - historyPercentage, (draftTokens / totalTokens) * 100);
  }, [draftTokens, totalTokens, historyPercentage]);

  const statusColor = useMemo(() => {
    if (percentage >= 90) return "bg-destructive";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-primary";
  }, [percentage]);

  const textColor = useMemo(() => {
    if (percentage >= 90) return "text-destructive";
    if (percentage >= 70) return "text-yellow-600 dark:text-yellow-500";
    return "text-muted-foreground";
  }, [percentage]);

  if (totalTokens === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-2 cursor-help text-[10px] sm:text-xs transition-colors",
              className
            )}
          >
            <div className="h-1.5 w-16 sm:w-20 bg-muted/50 rounded-full overflow-hidden flex">
              <div
                className={cn("h-full transition-all duration-500 opacity-60", usedTokens > totalTokens * 0.9 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${historyPercentage}%` }}
              />
              <div
                className={cn("h-full transition-all duration-500", statusColor)}
                style={{ width: `${draftPercentage}%` }}
              />
            </div>
            <span className={cn("font-medium tabular-nums", textColor)}>
              {formatTokenCount(usedTokens)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs p-3">
          <div className="space-y-2 min-w-[160px]">
            <div className="flex items-center justify-between gap-4">
              <p className="font-semibold">{modelName}</p>
              <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight",
                percentage >= 90 ? "bg-destructive/10 text-destructive" :
                  percentage >= 70 ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500" :
                    "bg-primary/10 text-primary"
              )}>
                {percentage.toFixed(0)}%
              </span>
            </div>

            <div className="space-y-1 bg-muted/30 p-2 rounded-lg border border-border/50">
              <div className="flex justify-between">
                <span className="text-muted-foreground">History:</span>
                <span className="font-medium">{historyTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Draft:</span>
                <span className="font-medium">{draftTokens.toLocaleString()}</span>
              </div>
              <div className="pt-1 mt-1 border-t border-border/50 flex justify-between font-bold">
                <span>Total:</span>
                <span>{usedTokens.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-between text-[10px] opacity-70">
              <span>Limit:</span>
              <span>{totalTokens.toLocaleString()}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
