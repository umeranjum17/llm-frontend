"use client";

import { useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { useLiveQuery } from "dexie-react-hooks";
import { getMessages } from "@/lib/db/queries";
import { MessageItem } from "./message-item";
import { useChat } from "@/hooks/use-chat";
import { Loader2, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageListProps {
  chatId: string;
  arenaModelId?: string; // Optional filter for Arena Mode
}

export function MessageList({ chatId, arenaModelId }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { continueResponse, continuingMessageId, editMessage } = useChat(chatId);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const previousMessageCount = useRef(0);

  // Use Dexie live query for reactive updates
  const allMessages = useLiveQuery(() => getMessages(chatId), [chatId]);

  // Filter messages for Arena Mode if needed
  const messages = allMessages?.filter(m => {
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

  return (
    <div className="relative h-full">
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        itemContent={(index, message) => (
          <MessageItem
            message={message}
            onContinue={continueResponse}
            onEdit={editMessage}
            isContinuing={continuingMessageId === message.id}
          />
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
