"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getMessages, getChatById } from "@/lib/db/queries";
import { estimateRequestCost, formatTokenCount, formatCost } from "@/lib/utils/token-counter";
import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";

interface TokenDisplayProps {
  chatId: string;
  inputContent: string;
}

export function TokenDisplay({ chatId, inputContent }: TokenDisplayProps) {
  const messages = useLiveQuery(() => getMessages(chatId), [chatId]);
  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);

  const estimate = useMemo(() => {
    if (!messages || !chat || !inputContent.trim()) return null;

    return estimateRequestCost(
      messages,
      inputContent,
      chat.modelId,
      500 // Estimate 500 tokens for response
    );
  }, [messages, chat, inputContent]);

  if (!estimate || !inputContent.trim()) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <Coins className="h-3 w-3" />
        <span>{formatTokenCount(estimate.inputTokens)}</span>
      </div>
      <span>→</span>
      <span>{formatCost(estimate.estimatedCost)}</span>
    </div>
  );
}
