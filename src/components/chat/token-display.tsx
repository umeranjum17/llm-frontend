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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FileStack, Layers } from "lucide-react";
import type { ContextCompactionState } from "@/stores/streaming-store";

interface TokenDisplayProps {
  historyTokens: number;
  draftTokens: number;
  totalTokens: number;
  modelName: string;
  className?: string;
  compactionState?: ContextCompactionState | null;
}

export function TokenDisplay({
  historyTokens,
  draftTokens,
  totalTokens,
  modelName,
  className,
  compactionState,
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

  const hasCompaction = compactionState && (compactionState.wasCompacted || compactionState.wasTruncated);

  const displayContent = (
    <div
      className={cn(
        "flex items-center gap-2 text-[10px] sm:text-xs transition-colors",
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
      {hasCompaction && (
        <Layers className="h-3 w-3 text-blue-500" />
      )}
    </div>
  );

  const detailsContent = (
    <div className="space-y-2 min-w-[180px]">
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold text-xs">{modelName}</p>
        <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight",
          percentage >= 90 ? "bg-destructive/10 text-destructive" :
            percentage >= 70 ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500" :
              "bg-primary/10 text-primary"
        )}>
          {percentage.toFixed(0)}%
        </span>
      </div>

      <div className="space-y-1 bg-muted/30 p-2 rounded-lg border border-border/50 text-xs">
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

      {/* Compaction state display */}
      {compactionState && (compactionState.wasCompacted || compactionState.wasTruncated) && (
        <div className="space-y-1 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20 text-xs">
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
            <Layers className="h-3 w-3" />
            <span>Context Compacted</span>
          </div>
          <div className="space-y-0.5 text-muted-foreground">
            <div className="flex justify-between">
              <span>Full messages:</span>
              <span className="font-medium text-foreground">{compactionState.messagesInFull}</span>
            </div>
            {compactionState.messagesSummarized > 0 && (
              <div className="flex justify-between">
                <span>Summarized:</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">{compactionState.messagesSummarized}</span>
              </div>
            )}
            {compactionState.messagesDropped > 0 && (
              <div className="flex justify-between">
                <span>Dropped:</span>
                <span className="font-medium text-amber-600 dark:text-amber-400">{compactionState.messagesDropped}</span>
              </div>
            )}
            {compactionState.tokensSaved > 0 && (
              <div className="flex justify-between pt-1 border-t border-blue-500/20">
                <span>Tokens saved:</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  ~{Math.round(compactionState.tokensSaved / 100) / 10}k
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between text-[10px] opacity-70">
        <span>Limit:</span>
        <span>{totalTokens.toLocaleString()}</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Tooltip */}
      <div className="hidden sm:block">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">{displayContent}</div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs p-3">
              {detailsContent}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Mobile: Popover (tap to open) */}
      <div className="sm:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <button className="cursor-pointer active:opacity-70 transition-opacity">
              {displayContent}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-auto p-3">
            {detailsContent}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
