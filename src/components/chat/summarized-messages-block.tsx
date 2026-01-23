"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Layers, RefreshCw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContextSummary } from "@/lib/db/schema";

interface SummarizedMessagesBlockProps {
  summary: ContextSummary;
  onRestore?: () => void;
  onRegenerate?: () => void;
  className?: string;
}

export function SummarizedMessagesBlock({
  summary,
  onRestore,
  onRegenerate,
  className,
}: SummarizedMessagesBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const dateRange = summary.dateRange
    ? `${new Date(summary.dateRange.start).toLocaleDateString()} - ${new Date(summary.dateRange.end).toLocaleDateString()}`
    : new Date(summary.createdAt).toLocaleDateString();

  const tokensSaved = summary.originalTokenCount - summary.summaryTokenCount;
  const savingsPercent = Math.round((tokensSaved / summary.originalTokenCount) * 100);

  return (
    <div
      className={cn(
        "group mx-auto max-w-3xl px-2 sm:px-4 py-2",
        className
      )}
    >
      <div className="mx-auto">
        <div
          className={cn(
            "rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30",
            "overflow-hidden transition-all duration-200"
          )}
        >
          {/* Header - always visible */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "w-full flex items-center justify-between gap-3 px-4 py-3",
              "hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors",
              "text-left"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {summary.originalMessageIds.length} messages summarized
                </div>
                <div className="text-xs text-blue-600/70 dark:text-blue-400/70">
                  {dateRange} &bull; Saved ~{Math.round(tokensSaved / 100) / 10}k tokens ({savingsPercent}%)
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-blue-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-blue-500" />
              )}
            </div>
          </button>

          {/* Expanded content */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="px-4 pb-4 pt-2 border-t border-blue-200/50 dark:border-blue-800/50">
                  {/* Summary content */}
                  <div className="mb-3">
                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                      Summary
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-wrap bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                      {summary.summary}
                    </div>
                  </div>

                  {/* Actions */}
                  {(onRestore || onRegenerate) && (
                    <div className="flex items-center gap-2 pt-2">
                      {onRegenerate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRegenerate();
                          }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1.5" />
                          Regenerate
                        </Button>
                      )}
                      {onRestore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestore();
                          }}
                        >
                          <Undo2 className="h-3 w-3 mr-1.5" />
                          Restore Original
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
