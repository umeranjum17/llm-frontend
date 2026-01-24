/**
 * Context Compaction Engine
 *
 * Intelligently compacts older messages into summaries instead of
 * simply discarding them. Provides visibility into what was compacted
 * and allows users to control which messages are preserved.
 */

import { nanoid } from "nanoid";
import { db, type Message, type ContextSummary } from "@/lib/db/schema";
import { countTokens } from "@/lib/utils/token-counter";
import { getTextFromMessageContent } from "@/lib/utils/message-content";

// Simple message format for compaction output
export interface CompactedMessage {
  role: "system" | "user" | "assistant";
  content: string;
  originalId?: string; // Original message ID if this came from a DB message
  isSummary?: boolean; // True if this is a generated summary message
}

// Constants
const COMPACTION_THRESHOLD = 0.80; // Trigger compaction at 80% context usage
const MIN_MESSAGES_TO_KEEP = 6; // Always keep last 3 exchanges
const MIN_MESSAGES_TO_SUMMARIZE = 4; // Need at least 4 messages to make summarization worthwhile
const SUMMARY_CHUNK_SIZE = 20; // Summarize up to 20 messages at a time

export interface CompactionCandidate {
  message: Message;
  tokens: number;
}

export interface CompactionResult {
  // Final history to send to LLM (simplified format - hook will transform)
  compactedHistory: CompactedMessage[];
  // Original messages that were kept (for transformation by hook)
  keptMessageIds: string[];
  // Statistics for UI
  wasCompacted: boolean;
  wasTruncated: boolean;
  originalMessageCount: number;
  messagesInFull: number;
  messagesSummarized: number;
  messagesDropped: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  // Summary info for display
  summaryInfo?: {
    id: string;
    summary: string;
    originalMessageIds: string[];
    dateRange: { start: number; end: number };
  };
  // Error info if compaction failed
  error?: string;
}

export interface CompactionConfig {
  chatId: string;
  modelId?: string;  // Which model we're compacting for (multi-model mode)
  providerId: string;
  apiKey: string;
  providerBaseUrl?: string;
  isIncognitoMode: boolean;
  smartCompactionEnabled: boolean;
}

/**
 * Estimate tokens for a message
 */
function estimateMessageTokens(message: Message | CompactedMessage): number {
  if ("originalId" in message || typeof message.content === "string") {
    // CompactedMessage - content is always string
    return countTokens(message.content as string) + 4;
  }
  // Message from DB
  const content = getTextFromMessageContent(message.content);
  return countTokens(content) + 4; // Add overhead for role/formatting
}

/**
 * Get all summaries for a chat
 */
export async function getSummariesForChat(chatId: string): Promise<ContextSummary[]> {
  return db.contextSummaries.where("chatId").equals(chatId).toArray();
}

/**
 * Get summaries for a chat filtered by model (multi-model mode)
 * Returns summaries that either have no modelId or match the specified modelId
 */
export async function getSummariesForChatAndModel(
  chatId: string,
  modelId?: string
): Promise<ContextSummary[]> {
  if (!modelId) {
    return getSummariesForChat(chatId);
  }
  return db.contextSummaries
    .where("chatId")
    .equals(chatId)
    .filter((s) => !s.modelId || s.modelId === modelId)
    .toArray();
}

/**
 * Get pinned message IDs for a chat
 */
export async function getPinnedMessageIds(chatId: string): Promise<Set<string>> {
  const pinned = await db.messages
    .where("chatId")
    .equals(chatId)
    .filter((m) => m.isPinned === true)
    .toArray();
  return new Set(pinned.map((m) => m.id));
}

/**
 * Mark messages as summarized
 */
async function markMessagesAsSummarized(
  messageIds: string[],
  summaryId: string
): Promise<void> {
  await db.messages
    .where("id")
    .anyOf(messageIds)
    .modify({
      isSummarized: true,
      summarizedIntoId: summaryId,
    });
}

/**
 * Store a context summary
 */
async function storeContextSummary(summary: ContextSummary): Promise<void> {
  await db.contextSummaries.put(summary);
}

/**
 * Generate summary via API
 */
async function generateSummary(
  messages: Message[],
  config: CompactionConfig
): Promise<{ summary: string; inputTokens: number; outputTokens: number } | null> {
  try {
    const response = await fetch("/api/chat/context-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "X-API-Key": config.apiKey } : {}),
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
        providerId: config.providerId,
        providerBaseUrl: config.providerBaseUrl,
        apiKey: config.apiKey,
      }),
    });

    if (!response.ok) {
      console.warn("[compaction] Summary API returned non-OK status:", response.status);
      return null;
    }

    const data = await response.json();

    if (!data.summary || data.error) {
      console.warn("[compaction] Summary generation failed:", data.error);
      return null;
    }

    return {
      summary: data.summary,
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
    };
  } catch (error) {
    console.error("[compaction] Summary API error:", error);
    return null;
  }
}

/**
 * Main compaction function
 *
 * Takes raw messages and a token budget, returns compacted history
 * that fits within the budget while preserving as much context as possible.
 */
export async function compactContextToFit(
  messages: Message[],
  tokenBudget: number,
  config: CompactionConfig
): Promise<CompactionResult> {
  const originalMessageCount = messages.length;
  const tokensBefore = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);

  // Helper to convert Message to CompactedMessage
  const toCompactedMessage = (m: Message): CompactedMessage => ({
    role: m.role as "system" | "user" | "assistant",
    content: getTextFromMessageContent(m.content),
    originalId: m.id,
  });

  // Default result for early returns
  const createResult = (overrides: Partial<CompactionResult>): CompactionResult => ({
    compactedHistory: messages.map(toCompactedMessage),
    keptMessageIds: messages.map(m => m.id),
    wasCompacted: false,
    wasTruncated: false,
    originalMessageCount,
    messagesInFull: messages.length,
    messagesSummarized: 0,
    messagesDropped: 0,
    tokensBefore,
    tokensAfter: tokensBefore,
    tokensSaved: 0,
    ...overrides,
  });

  // 1. If history already fits, return as-is
  if (tokensBefore <= tokenBudget) {
    return createResult({});
  }

  // 2. If incognito mode or smart compaction disabled, fall back to truncation
  if (config.isIncognitoMode || !config.smartCompactionEnabled) {
    return truncateOnly(messages, tokenBudget, createResult);
  }

  // 3. Get pinned messages
  const pinnedIds = await getPinnedMessageIds(config.chatId);

  // 4. Identify compaction candidates
  // - Exclude pinned messages
  // - Exclude the last MIN_MESSAGES_TO_KEEP messages
  // - Must have at least MIN_MESSAGES_TO_SUMMARIZE candidates

  const recentMessages = messages.slice(-MIN_MESSAGES_TO_KEEP);
  const olderMessages = messages.slice(0, -MIN_MESSAGES_TO_KEEP);

  const candidates: CompactionCandidate[] = olderMessages
    .filter((m) => !pinnedIds.has(m.id))
    .map((m) => ({
      message: m,
      tokens: estimateMessageTokens(m),
    }));

  // 5. Check if we have enough candidates
  if (candidates.length < MIN_MESSAGES_TO_SUMMARIZE) {
    // Not enough to summarize, fall back to truncation
    return truncateOnly(messages, tokenBudget, createResult);
  }

  // 6. Take a chunk of oldest candidates to summarize
  const toSummarize = candidates.slice(0, Math.min(SUMMARY_CHUNK_SIZE, candidates.length));
  const toSummarizeMessages = toSummarize.map((c) => c.message);
  const toSummarizeTokens = toSummarize.reduce((sum, c) => sum + c.tokens, 0);

  // 7. Generate summary
  const summaryResult = await generateSummary(toSummarizeMessages, config);

  if (!summaryResult) {
    // Summary generation failed, fall back to truncation
    return truncateOnly(messages, tokenBudget, createResult, "Summary generation failed");
  }

  // 8. Calculate summary tokens
  const summaryTokens = countTokens(summaryResult.summary) + 20; // Add overhead

  // 9. Check if summary actually saves tokens
  if (summaryTokens >= toSummarizeTokens * 0.7) {
    // Summary doesn't save enough, fall back to truncation
    return truncateOnly(
      messages,
      tokenBudget,
      createResult,
      "Summary would not save enough tokens"
    );
  }

  // 10. Create summary record
  const summaryId = nanoid();
  const originalMessageIds = toSummarizeMessages.map((m) => m.id);
  const dateRange = {
    start: toSummarizeMessages[0].createdAt,
    end: toSummarizeMessages[toSummarizeMessages.length - 1].createdAt,
  };

  const contextSummary: ContextSummary = {
    id: summaryId,
    chatId: config.chatId,
    summary: summaryResult.summary,
    originalMessageIds,
    originalTokenCount: toSummarizeTokens,
    summaryTokenCount: summaryTokens,
    createdAt: Date.now(),
    modelId: config.modelId,  // Track which model this summary was created for
    dateRange,
  };

  // 11. Store summary and mark messages
  await storeContextSummary(contextSummary);
  await markMessagesAsSummarized(originalMessageIds, summaryId);

  // 12. Build compacted history
  // - Start with summary as system message
  // - Add remaining older messages that weren't summarized
  // - Add recent messages

  const summarizedIds = new Set(originalMessageIds);
  const remainingOlderMessages = olderMessages.filter(
    (m) => !summarizedIds.has(m.id)
  );

  const summaryMessage: CompactedMessage = {
    role: "system",
    content: `[Context Summary - ${toSummarizeMessages.length} messages from ${new Date(dateRange.start).toLocaleDateString()} to ${new Date(dateRange.end).toLocaleDateString()}]\n\n${summaryResult.summary}`,
    isSummary: true,
  };

  const compactedHistory: CompactedMessage[] = [
    summaryMessage,
    ...remainingOlderMessages.map(toCompactedMessage),
    ...recentMessages.map(toCompactedMessage),
  ];

  const keptMessageIds = [
    ...remainingOlderMessages.map(m => m.id),
    ...recentMessages.map(m => m.id),
  ];

  // 13. Check if we still need truncation
  const tokensAfterCompaction = compactedHistory.reduce(
    (sum, m) => sum + countTokens(m.content) + 4,
    0
  );

  if (tokensAfterCompaction > tokenBudget) {
    // Still over budget, need to truncate
    return truncateCompactedHistory(
      compactedHistory,
      keptMessageIds,
      tokenBudget,
      {
        wasCompacted: true,
        originalMessageCount,
        messagesSummarized: toSummarizeMessages.length,
        tokensBefore,
        summaryInfo: {
          id: summaryId,
          summary: summaryResult.summary,
          originalMessageIds,
          dateRange,
        },
      }
    );
  }

  // 14. Return successful compaction result
  return {
    compactedHistory,
    keptMessageIds,
    wasCompacted: true,
    wasTruncated: false,
    originalMessageCount,
    messagesInFull: remainingOlderMessages.length + recentMessages.length,
    messagesSummarized: toSummarizeMessages.length,
    messagesDropped: 0,
    tokensBefore,
    tokensAfter: tokensAfterCompaction,
    tokensSaved: tokensBefore - tokensAfterCompaction,
    summaryInfo: {
      id: summaryId,
      summary: summaryResult.summary,
      originalMessageIds,
      dateRange,
    },
  };
}

/**
 * Simple truncation fallback
 */
function truncateOnly(
  messages: Message[],
  tokenBudget: number,
  createResult: (overrides: Partial<CompactionResult>) => CompactionResult,
  error?: string
): CompactionResult {
  const truncated: CompactedMessage[] = [];
  const keptIds: string[] = [];
  let currentTokens = 0;

  // Process from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = estimateMessageTokens(msg);

    if (currentTokens + tokens > tokenBudget && truncated.length >= MIN_MESSAGES_TO_KEEP) {
      break;
    }

    truncated.unshift({
      role: msg.role as "system" | "user" | "assistant",
      content: getTextFromMessageContent(msg.content),
      originalId: msg.id,
    });
    keptIds.unshift(msg.id);
    currentTokens += tokens;
  }

  const tokensAfter = currentTokens;
  const messagesDropped = messages.length - truncated.length;

  return {
    ...createResult({}),
    compactedHistory: truncated,
    keptMessageIds: keptIds,
    wasCompacted: false,
    wasTruncated: messagesDropped > 0,
    messagesInFull: truncated.length,
    messagesDropped,
    tokensAfter,
    tokensSaved: createResult({}).tokensBefore - tokensAfter,
    error,
  };
}

/**
 * Truncate already-compacted history if still over budget
 */
function truncateCompactedHistory(
  history: CompactedMessage[],
  keptMessageIds: string[],
  tokenBudget: number,
  context: {
    wasCompacted: boolean;
    originalMessageCount: number;
    messagesSummarized: number;
    tokensBefore: number;
    summaryInfo?: CompactionResult["summaryInfo"];
  }
): CompactionResult {
  const truncated: CompactedMessage[] = [];
  const keptIds: string[] = [];
  let currentTokens = 0;

  // Always keep the summary message (first one if it's a summary)
  if (history.length > 0 && history[0].isSummary) {
    const summaryTokens = countTokens(history[0].content) + 4;
    truncated.push(history[0]);
    currentTokens += summaryTokens;
  }

  // Process remaining from newest to oldest
  for (let i = history.length - 1; i >= 1; i--) {
    const msg = history[i];
    const tokens = countTokens(msg.content) + 4;

    if (currentTokens + tokens > tokenBudget && truncated.length >= MIN_MESSAGES_TO_KEEP) {
      break;
    }

    truncated.splice(1, 0, msg); // Insert after summary
    if (msg.originalId) keptIds.push(msg.originalId);
    currentTokens += tokens;
  }

  const tokensAfter = currentTokens;
  const messagesDropped = history.length - truncated.length;

  return {
    compactedHistory: truncated,
    keptMessageIds: keptIds,
    wasCompacted: context.wasCompacted,
    wasTruncated: messagesDropped > 0,
    originalMessageCount: context.originalMessageCount,
    messagesInFull: truncated.length - 1, // Exclude summary message
    messagesSummarized: context.messagesSummarized,
    messagesDropped,
    tokensBefore: context.tokensBefore,
    tokensAfter,
    tokensSaved: context.tokensBefore - tokensAfter,
    summaryInfo: context.summaryInfo,
  };
}

/**
 * Check if compaction should be triggered based on context usage
 */
export function shouldTriggerCompaction(
  currentTokens: number,
  totalBudget: number
): boolean {
  return currentTokens / totalBudget >= COMPACTION_THRESHOLD;
}

/**
 * Toggle pin status for a message
 */
export async function toggleMessagePin(messageId: string): Promise<boolean> {
  const message = await db.messages.get(messageId);
  if (!message) return false;

  const newPinned = !message.isPinned;
  await db.messages.update(messageId, { isPinned: newPinned });
  return newPinned;
}

/**
 * Get compaction state for a chat
 */
export async function getCompactionState(chatId: string): Promise<{
  summaries: ContextSummary[];
  pinnedCount: number;
  summarizedCount: number;
}> {
  const [summaries, pinnedMessages, summarizedMessages] = await Promise.all([
    getSummariesForChat(chatId),
    db.messages.where("chatId").equals(chatId).filter((m) => m.isPinned === true).count(),
    db.messages.where("chatId").equals(chatId).filter((m) => m.isSummarized === true).count(),
  ]);

  return {
    summaries,
    pinnedCount: pinnedMessages,
    summarizedCount: summarizedMessages,
  };
}

/**
 * Delete a context summary and restore messages
 */
export async function restoreSummarizedMessages(summaryId: string): Promise<void> {
  const summary = await db.contextSummaries.get(summaryId);
  if (!summary) return;

  // Unmark messages
  await db.messages
    .where("id")
    .anyOf(summary.originalMessageIds)
    .modify({
      isSummarized: false,
      summarizedIntoId: undefined,
    });

  // Delete summary
  await db.contextSummaries.delete(summaryId);
}
