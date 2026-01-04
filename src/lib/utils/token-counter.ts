import { encode } from "gpt-tokenizer";
import { getModelById } from "@/lib/constants/models";
import type { Message } from "@/lib/db/schema";

export function countTokens(text: string): number {
  try {
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback: rough estimation (4 chars ≈ 1 token)
    return Math.ceil(text.length / 4);
  }
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string
): number {
  const model = getModelById(modelId);
  if (!model) return 0;

  const inputCost = (inputTokens / 1_000_000) * model.inputCost;
  const outputCost = (outputTokens / 1_000_000) * model.outputCost;

  return inputCost + outputCost;
}

export function countMessagesTokens(messages: Message[]): number {
  let total = 0;

  for (const message of messages) {
    // Count message content
    total += countTokens(message.content);

    // Add overhead for message formatting (role, etc.)
    total += 4; // Approximate overhead per message

    // Count tool calls and results
    if (message.toolCalls) {
      total += countTokens(JSON.stringify(message.toolCalls));
    }
    if (message.toolResults) {
      total += countTokens(JSON.stringify(message.toolResults));
    }
  }

  return total;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  } else if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(1)}k tokens`;
  } else {
    return `${(tokens / 1_000_000).toFixed(2)}M tokens`;
  }
}

export function formatCost(cost: number): string {
  if (cost === 0) return "Free";
  if (cost < 0.01) return `<$0.01`;
  return `$${cost.toFixed(2)}`;
}

export interface TokenEstimate {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export function estimateRequestCost(
  messages: Message[],
  newMessageContent: string,
  modelId: string,
  estimatedResponseLength: number = 500
): TokenEstimate {
  const inputTokens = countMessagesTokens(messages) + countTokens(newMessageContent);
  const estimatedOutputTokens = estimatedResponseLength;
  const totalTokens = inputTokens + estimatedOutputTokens;
  const estimatedCost = estimateCost(inputTokens, estimatedOutputTokens, modelId);

  return {
    inputTokens,
    estimatedOutputTokens,
    totalTokens,
    estimatedCost,
  };
}
