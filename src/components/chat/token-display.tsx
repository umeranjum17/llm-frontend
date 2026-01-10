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
  usedTokens: number;
  totalTokens: number;
  modelName: string;
  className?: string;
}

export function TokenDisplay({
  usedTokens,
  totalTokens,
  modelName,
  className,
}: TokenDisplayProps) {
  const percentage = useMemo(() => {
    if (totalTokens === 0) return 0;
    return Math.min(100, (usedTokens / totalTokens) * 100);
  }, [usedTokens, totalTokens]);

  const statusColor = useMemo(() => {
    if (percentage >= 90) return "bg-destructive";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-green-500";
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
            <div className="h-1.5 w-16 sm:w-20 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full transition-all duration-500", statusColor)}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className={cn("font-medium tabular-nums", textColor)}>
              {formatTokenCount(usedTokens)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            <p className="font-semibold">{modelName} Context</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-muted-foreground">Used:</span>
              <span className="text-right font-medium">{usedTokens.toLocaleString()}</span>

              <span className="text-muted-foreground">Limit:</span>
              <span className="text-right font-medium">{totalTokens.toLocaleString()}</span>

              <span className="text-muted-foreground">Usage:</span>
              <span className="text-right font-medium">{percentage.toFixed(1)}%</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
