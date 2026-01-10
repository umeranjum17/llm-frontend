"use client";

import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { useLiveQuery } from "dexie-react-hooks";
import { getChatById, getMessages, updateChat } from "@/lib/db/queries";
import { MessageItem } from "./message-item";
import { useChat } from "@/hooks/use-chat";
import { Loader2, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/db/schema";
import { BranchNavigator } from "./branch-navigator";
import { useSuggestedResponses } from "@/hooks/use-suggested-responses";
import { SuggestedResponses } from "./suggested-responses";

interface MessageListProps {
  chatId: string;
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
const MessageRow = memo(function MessageRow({
  message,
  onContinue,
  onEdit,
  onFork,
  onRegenerate,
  isContinuing,
  siblings,
  siblingIndex,
  onSwitchSibling,
  showBranchNav,
}: {
  message: Message;
  onContinue: (messageId: string) => void;
  onEdit: (messageId: string, newContent: string) => void;
  onFork: (messageId: string) => void;
  onRegenerate: (assistantMessageId: string) => void;
  isContinuing: boolean;
  siblings: Message[];
  siblingIndex: number;
  onSwitchSibling: (message: Message, direction: -1 | 1) => void;
  showBranchNav: boolean;
}) {
  return (
    <div>
      <MessageItem
        message={message}
        onContinue={onContinue}
        onEdit={onEdit}
        onFork={onFork}
        onRegenerate={onRegenerate}
        isContinuing={isContinuing}
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
});

export function MessageList({ chatId, arenaModelId, onSendMessage }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { continueResponse, continuingMessageId, editMessage, regenerateAssistant } = useChat(chatId);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const previousMessageCount = useRef(0);

  // Use Dexie live query for reactive updates
  const allMessages = useLiveQuery(() => getMessages(chatId), [chatId]);
  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);

  // Memoize the maps to avoid rebuilding on every render
  const { byId, childrenByParent } = useMemo(() => {
    if (!allMessages) return { byId: new Map<string, Message>(), childrenByParent: new Map<string, Message[]>() };
    return buildMaps(allMessages);
  }, [allMessages]);

  const { suggestions, isLoading: suggestionsLoading, setSuggestions } = useSuggestedResponses(
    chatId,
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
  }, [messageCount, isAtBottom]);

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
    await updateChat(chatId, { activeBranchLeafId: newLeaf, hasBranches: true });
  }, [allMessages, chatId, childrenByParent]);

  const handleFork = useCallback(async (messageId: string) => {
    // Fork: set the active branch to this message, creating a new branch point
    const message = byId.get(messageId);
    if (!message) return;

    // Update chat to point to this message as the active leaf
    // This effectively creates a new branch from this point
    await updateChat(chatId, {
      activeBranchLeafId: messageId,
      hasBranches: true
    });
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
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        increaseViewportBy={{ top: 200, bottom: 200 }}
        overscan={100}
        itemContent={(index, message) => {
          const siblingInfo = siblingInfoMap.get(message.id) || { siblings: [], index: -1 };
          return (
            <MessageRow
              message={message}
              onContinue={continueResponse}
              onEdit={editMessage}
              onFork={handleFork}
              onRegenerate={regenerateAssistant}
              isContinuing={continuingMessageId === message.id}
              siblings={siblingInfo.siblings}
              siblingIndex={siblingInfo.index}
              onSwitchSibling={switchSibling}
              showBranchNav={!arenaModelId}
            />
          );
        }}
        followOutput={isAtBottom ? "smooth" : false}
        alignToBottom
        atBottomStateChange={handleAtBottomChange}
        className="scrollbar-thin"
        components={{
          Footer: () => (
            <div className="mx-auto max-w-3xl px-4 pb-4">
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
      {showNewMessagesButton && !isAtBottom && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <Button
            onClick={scrollToBottom}
            size="sm"
            className="shadow-lg gap-2"
          >
            <ArrowDown className="h-4 w-4" />
            New messages
          </Button>
        </div>
      )}
    </div>
  );
}
