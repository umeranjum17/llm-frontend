/**
 * Context Budget Utility
 *
 * Manages context window limits by calculating token budgets
 * and truncating chat history to fit within model limits.
 * Now includes intelligent compaction via context-compaction.ts
 */

import { getModelById } from "@/lib/constants/models";
import { countTokens } from "@/lib/utils/token-counter";
import {
  compactContextToFit,
  shouldTriggerCompaction,
  type CompactionResult,
  type CompactionConfig,
  type CompactedMessage,
} from "@/lib/utils/context-compaction";
import type { Message } from "@/lib/db/schema";

// Constants
const OUTPUT_TOKEN_RESERVE = 4000; // Reserve for model output
const SAFETY_MARGIN = 0.95; // Use 95% of context limit
const MIN_HISTORY_MESSAGES = 4; // Always keep last 2 exchanges (user + assistant each)
const DEFAULT_CONTEXT_LENGTH = 128000; // Safe default for unknown models

// AI SDK content part types (after convertToAISDKContent transformation)
type AISDKContentPart = { type: "text"; text: string } | { type: "image"; image: string };

// Type for LLM messages - accepts both raw MessageContent and AI SDK transformed content
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | AISDKContentPart[];
}

export interface ContextBudget {
  modelContextLength: number;
  usableContext: number; // After safety margin
  systemTokens: number;
  attachmentTokens: number;
  outputReserve: number;
  remainingForHistory: number;
}

export interface TruncationResult {
  truncatedHistory: LLMMessage[];
  wasLimited: boolean;
  originalCount: number;
  truncatedCount: number;
  tokensBefore: number;
  tokensAfter: number;
}

/**
 * Estimate tokens for a single message
 */
function estimateMessageTokens(message: LLMMessage): number {
  let tokens = 0;

  if (typeof message.content === "string") {
    tokens += countTokens(message.content);
  } else if (Array.isArray(message.content)) {
    // Handle AI SDK content format
    let textContent = "";
    let imageCount = 0;

    for (const part of message.content) {
      if (part.type === "text") {
        textContent += part.text;
      } else if (part.type === "image") {
        imageCount++;
      }
    }

    tokens += countTokens(textContent);
    // Heuristic overhead for images (exact tokenization is provider-specific)
    tokens += imageCount * 200;
  }

  // Add overhead for message formatting (role, etc.)
  tokens += 4;

  return tokens;
}

/**
 * Estimate total tokens for an array of messages
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/**
 * Calculate the available token budget for chat history
 */
export function calculateContextBudget(
  modelId: string,
  systemTokens: number,
  attachmentTokens: number = 0
): ContextBudget {
  const model = getModelById(modelId);
  const modelContextLength = model?.contextLength || DEFAULT_CONTEXT_LENGTH;

  // Apply safety margin to avoid edge cases
  const usableContext = Math.floor(modelContextLength * SAFETY_MARGIN);

  // Calculate what's remaining for history
  const remainingForHistory = Math.max(
    0,
    usableContext - systemTokens - attachmentTokens - OUTPUT_TOKEN_RESERVE
  );

  return {
    modelContextLength,
    usableContext,
    systemTokens,
    attachmentTokens,
    outputReserve: OUTPUT_TOKEN_RESERVE,
    remainingForHistory,
  };
}

/**
 * Truncate chat history to fit within the token budget.
 * Removes oldest messages first, but always keeps at least MIN_HISTORY_MESSAGES.
 */
export function truncateHistoryToFit(
  history: LLMMessage[],
  tokenBudget: number
): TruncationResult {
  const originalCount = history.length;
  const tokensBefore = estimateMessagesTokens(history);

  // If history fits within budget, return as-is
  if (tokensBefore <= tokenBudget) {
    return {
      truncatedHistory: history,
      wasLimited: false,
      originalCount,
      truncatedCount: originalCount,
      tokensBefore,
      tokensAfter: tokensBefore,
    };
  }

  // Start from the most recent messages and work backwards
  // We'll keep as many recent messages as will fit
  const truncated: LLMMessage[] = [];
  let currentTokens = 0;

  // Process messages from newest to oldest
  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(history[i]);

    // Check if adding this message would exceed budget
    if (currentTokens + msgTokens > tokenBudget) {
      // If we haven't met minimum message requirement, force-include
      if (truncated.length < MIN_HISTORY_MESSAGES) {
        truncated.unshift(history[i]);
        currentTokens += msgTokens;
      } else {
        // Stop adding more messages
        break;
      }
    } else {
      truncated.unshift(history[i]);
      currentTokens += msgTokens;
    }
  }

  const tokensAfter = estimateMessagesTokens(truncated);

  return {
    truncatedHistory: truncated,
    wasLimited: truncated.length < originalCount,
    originalCount,
    truncatedCount: truncated.length,
    tokensBefore,
    tokensAfter,
  };
}

/**
 * Check if the system context alone exceeds the model's context limit.
 * This is an early validation to provide a user-friendly error.
 */
export function validateSystemContextFits(
  modelId: string,
  systemTokens: number
): { fits: boolean; message?: string } {
  const model = getModelById(modelId);
  const modelContextLength = model?.contextLength || DEFAULT_CONTEXT_LENGTH;
  const usableContext = Math.floor(modelContextLength * SAFETY_MARGIN);

  // System context should leave room for at least some user input and output
  const minRemainingForChat = OUTPUT_TOKEN_RESERVE + 1000; // Reserve + some chat space

  if (systemTokens > usableContext - minRemainingForChat) {
    const modelName = model?.name || modelId;
    return {
      fits: false,
      message: `System prompts (${Math.round(systemTokens / 1000)}k tokens) exceed ${modelName}'s usable context (${Math.round(usableContext / 1000)}k tokens). Try disabling some memories or skills.`,
    };
  }

  return { fits: true };
}

/**
 * Compact and truncate history with intelligent summarization.
 *
 * This is the new preferred method for handling context limits.
 * It attempts to summarize older messages first, then falls back
 * to truncation if summarization isn't possible or sufficient.
 */
export async function compactAndTruncateHistory(
  messages: Message[],
  tokenBudget: number,
  config: CompactionConfig
): Promise<CompactionResult> {
  return compactContextToFit(messages, tokenBudget, config);
}

/**
 * Re-export compaction utilities for convenience
 */
export { shouldTriggerCompaction };
export type { CompactionResult, CompactionConfig, CompactedMessage };
