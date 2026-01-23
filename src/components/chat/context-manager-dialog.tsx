"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Layers, Pin, PinOff, RefreshCw, Undo2, Trash2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { db, type Message, type ContextSummary } from "@/lib/db/schema";
import { getMessages } from "@/lib/db/queries";
import {
  getSummariesForChat,
  toggleMessagePin,
  restoreSummarizedMessages,
} from "@/lib/utils/context-compaction";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { toast } from "sonner";

interface ContextManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string | undefined;
}

export function ContextManagerDialog({
  open,
  onOpenChange,
  chatId,
}: ContextManagerDialogProps) {
  const [summaries, setSummaries] = useState<ContextSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const messages = useLiveQuery(
    () => (chatId ? getMessages(chatId) : Promise.resolve([])),
    [chatId]
  );

  // Fetch summaries when dialog opens
  useEffect(() => {
    if (open && chatId) {
      getSummariesForChat(chatId).then(setSummaries);
    }
  }, [open, chatId]);

  const pinnedMessages = messages?.filter((m) => m.isPinned) || [];
  const summarizedMessages = messages?.filter((m) => m.isSummarized) || [];
  const regularMessages = messages?.filter(
    (m) => !m.isPinned && !m.isSummarized && (m.role === "user" || m.role === "assistant")
  ) || [];

  const handleTogglePin = async (messageId: string) => {
    await toggleMessagePin(messageId);
  };

  const handleRestoreSummary = async (summaryId: string) => {
    setIsLoading(true);
    try {
      await restoreSummarizedMessages(summaryId);
      setSummaries((prev) => prev.filter((s) => s.id !== summaryId));
      toast.success("Messages restored to full content");
    } catch (error) {
      toast.error("Failed to restore messages");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSummary = async (summaryId: string) => {
    setIsLoading(true);
    try {
      await db.contextSummaries.delete(summaryId);
      setSummaries((prev) => prev.filter((s) => s.id !== summaryId));
      toast.success("Summary deleted");
    } catch (error) {
      toast.error("Failed to delete summary");
    } finally {
      setIsLoading(false);
    }
  };

  const totalTokensSaved = summaries.reduce(
    (sum, s) => sum + (s.originalTokenCount - s.summaryTokenCount),
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Context Manager
          </DialogTitle>
          <DialogDescription>
            View and manage context compaction for this conversation
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="text-2xl font-bold text-foreground">
                  {messages?.filter((m) => m.role === "user" || m.role === "assistant").length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Total Messages</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {pinnedMessages.length}
                </div>
                <div className="text-xs text-amber-600/70 dark:text-amber-400/70">Pinned</div>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {summaries.length > 0 ? `~${Math.round(totalTokensSaved / 100) / 10}k` : "0"}
                </div>
                <div className="text-xs text-blue-600/70 dark:text-blue-400/70">Tokens Saved</div>
              </div>
            </div>

            {/* Summaries */}
            {summaries.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-500" />
                  Context Summaries ({summaries.length})
                </h3>
                <div className="space-y-3">
                  {summaries.map((summary) => (
                    <div
                      key={summary.id}
                      className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            {summary.originalMessageIds.length} messages
                          </div>
                          <div className="text-xs text-blue-600/70 dark:text-blue-400/70">
                            {summary.dateRange
                              ? `${new Date(summary.dateRange.start).toLocaleDateString()} - ${new Date(summary.dateRange.end).toLocaleDateString()}`
                              : new Date(summary.createdAt).toLocaleDateString()}
                            &bull; Saved ~{Math.round((summary.originalTokenCount - summary.summaryTokenCount) / 100) / 10}k tokens
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleRestoreSummary(summary.id)}
                            disabled={isLoading}
                            title="Restore original messages"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteSummary(summary.id)}
                            disabled={isLoading}
                            title="Delete summary"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-white/50 dark:bg-black/20 rounded p-2 max-h-32 overflow-y-auto">
                        {summary.summary.slice(0, 500)}
                        {summary.summary.length > 500 && "..."}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pinned Messages */}
            {pinnedMessages.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Pin className="h-4 w-4 text-amber-500" />
                  Pinned Messages ({pinnedMessages.length})
                </h3>
                <div className="space-y-2">
                  {pinnedMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 flex items-start gap-3"
                    >
                      <Badge
                        variant="secondary"
                        className={cn(
                          "shrink-0 text-[10px] uppercase",
                          msg.role === "user"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted"
                        )}
                      >
                        {msg.role}
                      </Badge>
                      <div className="flex-1 min-w-0 text-xs text-foreground/80 truncate">
                        {getTextFromMessageContent(msg.content).slice(0, 100)}
                        {getTextFromMessageContent(msg.content).length > 100 && "..."}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleTogglePin(msg.id)}
                        title="Unpin message"
                      >
                        <PinOff className="h-3.5 w-3.5 text-amber-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regular Messages (pinnable) */}
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Recent Messages ({regularMessages.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {regularMessages.slice(-20).map((msg) => (
                  <div
                    key={msg.id}
                    className="p-2 rounded-lg border bg-muted/30 flex items-start gap-3"
                  >
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 text-[10px] uppercase",
                        msg.role === "user"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted"
                      )}
                    >
                      {msg.role}
                    </Badge>
                    <div className="flex-1 min-w-0 text-xs text-foreground/80 truncate">
                      {getTextFromMessageContent(msg.content).slice(0, 80)}
                      {getTextFromMessageContent(msg.content).length > 80 && "..."}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-50 hover:opacity-100"
                      onClick={() => handleTogglePin(msg.id)}
                      title="Pin message (prevent summarization)"
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
