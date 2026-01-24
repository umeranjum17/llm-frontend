"use client";

import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { useLiveQueryWithTimeout } from "@/hooks/use-live-query-with-timeout";
import { getChatWithMessages, updateChat } from "@/lib/db/queries";
import { MessageItem } from "./message-item";
import { useChat } from "@/hooks/use-chat";
import { Loader2, ArrowDown, RefreshCw } from "lucide-react";
import { SkeletonMessage } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/db/schema";
import { BranchNavigator } from "./branch-navigator";
import { useSuggestedResponses } from "@/hooks/use-suggested-responses";
import { SuggestedResponses } from "./suggested-responses";
import { useStreamingStore } from "@/stores/streaming-store";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { cn } from "@/lib/utils";

interface MessageListProps {
  chatId: string | null;
  arenaModelId?: string; // Optional filter for Arena Mode
  onSendMessage?: (content: string) => void;
}

function buildMaps(allMessages: Message[]) {
  const byId = new Map<string, Message>();
  const childrenByParent = new Map<string, Message[]>();

  for (const m of allMessages) byId.set(m.id, m);

  for (const m of allMessages) {
    const key = m.parentId || "";
    const arr = childrenByParent.get(key) || [];
    arr.push(m);
    childrenByParent.set(key, arr);
  }

  for (const [key, arr] of childrenByParent.entries()) {
    arr.sort((a, b) => a.createdAt - b.createdAt);
    childrenByParent.set(key, arr);
  }

  return { byId, childrenByParent };
}

function getBranchPath(allMessages: Message[], leafId?: string, byIdMap?: Map<string, Message>) {
  if (allMessages.length === 0) return [];
  // Use provided map if available, otherwise compute it
  const byId = byIdMap ?? buildMaps(allMessages).byId;
  const fallbackLeaf = allMessages[allMessages.length - 1];
  let cursor = leafId ? byId.get(leafId) : fallbackLeaf;
  if (!cursor) cursor = fallbackLeaf;

  const visited = new Set<string>();
  const path: Message[] = [];
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path.reverse();
}

function getLatestLeafFrom(messageId: string, childrenByParent: Map<string, Message[]>) {
  let cursor = messageId;
  const visited = new Set<string>();
  while (!visited.has(cursor)) {
    visited.add(cursor);
    const children = childrenByParent.get(cursor) || [];
    if (children.length === 0) break;
    cursor = children[children.length - 1].id;
  }
  return cursor;
}

// Memoized message row component to prevent unnecessary re-renders
// Custom comparison: always re-render if streaming to show real-time updates
const MessageRow = memo(function MessageRow({
  message,
  onContinue,
  onEdit,
  onFork,
  onRegenerate,
  onResend,
  isContinuing,
  siblings,
  siblingIndex,
  onSwitchSibling,
  showBranchNav,
  isStreaming,
  streamingContent,
  streamingVersion,
}: {
  message: Message;
  onContinue: (messageId: string) => void;
  onEdit: (messageId: string, newContent: string) => void;
  onFork: (messageId: string) => void;
  onRegenerate: (assistantMessageId: string) => void;
  onResend: (userMessageId: string) => void;
  isContinuing: boolean;
  siblings: Message[];
  siblingIndex: number;
  onSwitchSibling: (message: Message, direction: -1 | 1) => void;
  showBranchNav: boolean;
  isStreaming: boolean;
  streamingContent?: string;
  streamingVersion?: number;
}) {
  return (
    <div>
      <MessageItem
        message={message}
        onContinue={onContinue}
        onEdit={onEdit}
        onFork={onFork}
        onRegenerate={onRegenerate}
        onResend={onResend}
        isContinuing={isContinuing}
        streamingContentProp={isStreaming ? streamingContent : undefined}
        streamingVersionProp={isStreaming ? streamingVersion : undefined}
      />
      {showBranchNav && siblings.length > 1 && siblingIndex !== -1 && (
        <div className="mx-auto max-w-3xl px-4 pb-4 -mt-4">
          <BranchNavigator
            index={siblingIndex}
            count={siblings.length}
            onPrev={() => onSwitchSibling(message, -1)}
            onNext={() => onSwitchSibling(message, 1)}
          />
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Always re-render if streaming to show real-time updates
  if (prevProps.isStreaming || nextProps.isStreaming) {
    return false; // false = re-render
  }
  // Otherwise use default shallow comparison for non-streaming messages
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.isContinuing === nextProps.isContinuing &&
    prevProps.siblingIndex === nextProps.siblingIndex &&
    prevProps.siblings.length === nextProps.siblings.length
  );
});

// Component to show pipeline execution progress
function PipelineProgressIndicator({ execution }: { execution: NonNullable<import("@/stores/streaming-store").ChatStreamingState['pipelineExecution']> }) {
  const currentStep = execution.steps[execution.currentStepIndex];
  const completedSteps = execution.steps.filter(s => s.status === "complete").length;
  const progress = ((completedSteps + 0.5) / execution.totalSteps) * 100;

  return (
    <motion.div
      className="py-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
    >
      <div className="flex items-start gap-3">
        <motion.div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
        </motion.div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <motion.span
              key={currentStep?.name}
              className="text-sm font-medium"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep?.name || "Processing..."}
            </motion.span>
            <span className="text-xs text-muted-foreground">
              ({completedSteps + 1}/{execution.totalSteps})
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full max-w-xs bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
            />
          </div>
          {/* Step list */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {execution.steps.map((step, idx) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05, duration: 0.2 }}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full transition-colors",
                  step.status === "complete" && "bg-green-500/20 text-green-600 dark:text-green-400",
                  step.status === "running" && "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                  step.status === "pending" && "bg-muted text-muted-foreground",
                  step.status === "error" && "bg-red-500/20 text-red-600 dark:text-red-400"
                )}
              >
                {step.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin inline mr-1" />}
                {step.name}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function MessageList({ chatId, arenaModelId, onSendMessage }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { continueResponse, continuingMessageId, editMessage, regenerateAssistant, resendMessage } = useChat(chatId);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const previousMessageCount = useRef(0);

  // Get streaming state for THIS chat to pass to MessageRow for proper re-renders
  const chatStreamingState = useStreamingStore((state) => chatId ? state.getChatStream(chatId) : null);
  const { streamingMessageId, streamingContent, streamingVersion, pipelineExecution } = chatStreamingState || {};

  // Use combined query to fetch chat and messages in one transaction
  const { data: chatData, isTimedOut, retry: handleRetry } = useLiveQueryWithTimeout(
    () => chatId ? getChatWithMessages(chatId) : undefined,
    [chatId],
    { timeoutMs: 5000 }
  );

  const allMessages = chatData?.messages;
  const chat = chatData?.chat;

  // Memoize the maps to avoid rebuilding on every render
  const { byId, childrenByParent } = useMemo(() => {
    if (!allMessages) return { byId: new Map<string, Message>(), childrenByParent: new Map<string, Message[]>() };
    return buildMaps(allMessages);
  }, [allMessages]);

  const { suggestions, isLoading: suggestionsLoading, setSuggestions } = useSuggestedResponses(
    chatId || undefined,
    allMessages || [],
    !arenaModelId // Suggestions only in normal mode for now
  );

  const activeLeafId = chat?.activeBranchLeafId;

  // Memoize branch path computation (reuse byId to avoid duplicate buildMaps)
  const branchPath = useMemo(() => {
    if (!allMessages) return undefined;
    return getBranchPath(allMessages, activeLeafId, byId);
  }, [allMessages, activeLeafId, byId]);

  // Memoize final messages list
  const messages = useMemo(() => {
    if (!branchPath || !allMessages) return undefined;

    if (!arenaModelId) {
      // Normal mode: just use branch path as-is
      return branchPath;
    }

    // Arena mode: Build message list that includes this model's responses
    const result: Message[] = [];

    for (const msg of branchPath) {
      if (msg.role === "user" || msg.role === "system") {
        result.push(msg);
        // For user messages, also find the arena assistant response for this model
        const children = childrenByParent.get(msg.id) || [];
        const arenaResponse = children.find(
          (c) => c.role === "assistant" && c.modelId === arenaModelId
        );
        if (arenaResponse) {
          result.push(arenaResponse);
        }
      }
      // Skip assistant messages from branchPath - we add them manually above
    }

    return result;
  }, [branchPath, allMessages, arenaModelId, childrenByParent]);

  const messageCount = messages?.length || 0;

  // Auto-scroll to bottom when new messages arrive (only if user is at bottom)
  useEffect(() => {
    if (messageCount === 0) return;

    // Check if there are new messages
    const hasNewMessages = messageCount > previousMessageCount.current;
    previousMessageCount.current = messageCount;

    if (!hasNewMessages) return;

    // Don't auto-scroll during streaming - let user read at their own pace
    if (streamingMessageId) {
      return;
    }

    if (isAtBottom) {
      // User is at bottom, auto-scroll
      virtuosoRef.current?.scrollToIndex({
        index: messageCount - 1,
        behavior: "smooth",
      });
    } else {
      // User has scrolled up, show "new messages" button
      setShowNewMessagesButton(true);
    }
  }, [messageCount, isAtBottom, streamingMessageId]);


  const scrollToBottom = useCallback(() => {
    if (messageCount > 0) {
      virtuosoRef.current?.scrollToIndex({ index: messageCount - 1, behavior: "smooth" });
      setShowNewMessagesButton(false);
    }
  }, [messageCount]);

  // Memoize callbacks to prevent re-renders
  const switchSibling = useCallback(async (message: Message, direction: -1 | 1) => {
    if (!allMessages) return;
    const parentKey = message.parentId || "";
    const siblings = (childrenByParent.get(parentKey) || []).filter((m) => m.role !== "tool");
    if (siblings.length <= 1) return;

    const currentIndex = siblings.findIndex((m) => m.id === message.id);
    if (currentIndex === -1) return;

    const nextIndex = (currentIndex + direction + siblings.length) % siblings.length;
    const siblingId = siblings[nextIndex].id;
    const newLeaf = getLatestLeafFrom(siblingId, childrenByParent);
    if (chatId) {
      await updateChat(chatId, { activeBranchLeafId: newLeaf, hasBranches: true });
    }
  }, [allMessages, chatId, childrenByParent]);

  const handleFork = useCallback(async (messageId: string) => {
    // Fork: set the active branch to this message, creating a new branch point
    const message = byId.get(messageId);
    if (!message) return;

    // Update chat to point to this message as the active leaf
    // This effectively creates a new branch from this point
    if (chatId) {
      await updateChat(chatId, {
        activeBranchLeafId: messageId,
        hasBranches: true
      });
    }
  }, [chatId, byId]);

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    setIsAtBottom(atBottom);
    if (atBottom) {
      setShowNewMessagesButton(false);
    }
  }, []);

  // Compute sibling info for each message - memoized
  const siblingInfoMap = useMemo(() => {
    const map = new Map<string, { siblings: Message[]; index: number }>();
    if (!messages) return map;

    for (const message of messages) {
      const parentKey = message.parentId || "";
      const siblings = (childrenByParent.get(parentKey) || []).filter((m) => m.role !== "tool");
      const idx = siblings.findIndex((m) => m.id === message.id);
      map.set(message.id, { siblings, index: idx });
    }
    return map;
  }, [messages, childrenByParent]);

  if (!messages) {
    return (
      <div className="flex h-full flex-col">
        {isTimedOut ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">Loading took too long</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden px-2 sm:px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-6">
              {/* Skeleton messages to indicate loading */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex gap-4">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0 hidden sm:block" />
                  <div className="flex-1 rounded-2xl border bg-primary/5 border-primary/20 p-4">
                    <SkeletonMessage />
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0 hidden sm:block" />
                  <div className="flex-1 rounded-2xl border bg-card p-4">
                    <SkeletonMessage />
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-8">
        <p className="text-muted-foreground mb-2">No messages yet</p>
        <p className="text-sm text-muted-foreground">
          Start the conversation below
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        computeItemKey={(index, message) => message.id}
        initialTopMostItemIndex={messages.length - 1}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        overscan={100}
        // Pass streaming context to force re-renders when streaming state changes
        context={{ streamingMessageId, streamingContent, streamingVersion }}
        itemContent={(index, message, context) => {
          const siblingInfo = siblingInfoMap.get(message.id) || { siblings: [], index: -1 };
          const isMessageStreaming = message.id === context.streamingMessageId;
          return (
            <div data-message-id={message.id}>
              <MessageRow
                message={message}
                onContinue={continueResponse}
                onEdit={editMessage}
                onFork={handleFork}
                onRegenerate={regenerateAssistant}
                onResend={resendMessage}
                isContinuing={continuingMessageId === message.id}
                siblings={siblingInfo.siblings}
                siblingIndex={siblingInfo.index}
                onSwitchSibling={switchSibling}
                showBranchNav={!arenaModelId}
                isStreaming={isMessageStreaming}
                streamingContent={isMessageStreaming ? context.streamingContent : undefined}
                streamingVersion={isMessageStreaming ? context.streamingVersion : undefined}
              />
            </div>
          );
        }}
        followOutput={(isAtBottom) => {
          // Disable auto-scroll during streaming so user can read at their own pace
          if (streamingMessageId) {
            return false;
          }
          // Not streaming: auto-scroll if at bottom (for new messages)
          return isAtBottom ? 'auto' : false;
        }}
        alignToBottom={!streamingMessageId}
        atBottomThreshold={100}
        atBottomStateChange={handleAtBottomChange}
        className="scrollbar-thin scroll-anchor-auto"
        style={{ overflowAnchor: 'auto' }}
        components={{
          Footer: () => (
            <div className="mx-auto max-w-3xl px-4 pb-4">
              {/* Pipeline progress indicator */}
              {pipelineExecution?.isActive && (
                <PipelineProgressIndicator execution={pipelineExecution} />
              )}
              <SuggestedResponses
                suggestions={suggestions}
                isLoading={suggestionsLoading}
                onSelect={(s) => {
                  onSendMessage?.(s);
                  setSuggestions([]);
                }}
              />
            </div>
          )
        }}
      />

      {/* New Messages Indicator */}
      <AnimatePresence>
        {showNewMessagesButton && !isAtBottom && (
          <motion.div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <motion.div
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
              <Button
                onClick={scrollToBottom}
                size="sm"
                className="shadow-lg gap-2"
              >
                <motion.span
                  animate={{ y: [0, 2, 0] }}
                  transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                >
                  <ArrowDown className="h-4 w-4" />
                </motion.span>
                New messages
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
