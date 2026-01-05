"use client";

import { useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { useLiveQuery } from "dexie-react-hooks";
import { getChatById, getMessages, updateChat } from "@/lib/db/queries";
import { MessageItem } from "./message-item";
import { useChat } from "@/hooks/use-chat";
import { Loader2, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/db/schema";
import { BranchNavigator } from "./branch-navigator";

interface MessageListProps {
  chatId: string;
  arenaModelId?: string; // Optional filter for Arena Mode
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

function getBranchPath(allMessages: Message[], leafId?: string) {
  if (allMessages.length === 0) return [];
  const { byId } = buildMaps(allMessages);
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

export function MessageList({ chatId, arenaModelId }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { continueResponse, continuingMessageId, editMessage, regenerateAssistant } = useChat(chatId);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const previousMessageCount = useRef(0);

  // Use Dexie live query for reactive updates
  const allMessages = useLiveQuery(() => getMessages(chatId), [chatId]);
  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);

  const activeLeafId = chat?.activeBranchLeafId;
  const branchPath = allMessages ? getBranchPath(allMessages, activeLeafId) : undefined;

  // Filter messages for Arena Mode if needed (within branch)
  const messages = branchPath?.filter((m) => {
    if (!arenaModelId) return true;
    if (m.role !== "assistant") return true;
    return m.modelId === arenaModelId;
  });

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

  const scrollToBottom = () => {
    if (messageCount > 0) {
      virtuosoRef.current?.scrollToIndex({ index: messageCount - 1, behavior: "smooth" });
      setShowNewMessagesButton(false);
    }
  };

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

  const { childrenByParent } = allMessages ? buildMaps(allMessages) : { childrenByParent: new Map<string, Message[]>() };

  const switchSibling = async (message: Message, direction: -1 | 1) => {
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
  };

  const handleFork = async (messageId: string) => {
    await updateChat(chatId, { activeBranchLeafId: messageId, hasBranches: true });
  };

  return (
    <div className="relative h-full">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        itemContent={(index, message) => (
          <div>
            <MessageItem
              message={message}
              onContinue={continueResponse}
              onEdit={editMessage}
              onFork={handleFork}
              onRegenerate={regenerateAssistant}
              isContinuing={continuingMessageId === message.id}
            />
            {(() => {
              const parentKey = message.parentId || "";
              const siblings = (childrenByParent.get(parentKey) || []).filter((m) => m.role !== "tool");
              if (siblings.length <= 1) return null;
              const idx = siblings.findIndex((m) => m.id === message.id);
              if (idx === -1) return null;
              return (
                <div className="mx-auto max-w-3xl px-4 pb-4 -mt-4">
                  <BranchNavigator
                    index={idx}
                    count={siblings.length}
                    onPrev={() => switchSibling(message, -1)}
                    onNext={() => switchSibling(message, 1)}
                  />
                </div>
              );
            })()}
          </div>
        )}
        followOutput={isAtBottom ? "smooth" : false}
        alignToBottom
        atBottomStateChange={(atBottom) => {
          setIsAtBottom(atBottom);
          if (atBottom) {
            setShowNewMessagesButton(false);
          }
        }}
        className="scrollbar-thin"
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
