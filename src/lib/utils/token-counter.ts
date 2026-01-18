import { encode } from "gpt-tokenizer";
import { getAllModels, getModelById } from "@/lib/constants/models";
import type { Message } from "@/lib/db/schema";
import { getImagesFromMessageContent, getTextFromMessageContent } from "@/lib/utils/message-content";

export function countTokens(text: string): number {
  try {
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback: rough estimation (4 chars ≈ 1 token)
    return Math.ceil(text.length / 4);
  }
}

// Default pricing fallback when model not found in catalog (per 1M tokens)
// These are conservative estimates to provide reasonable cost tracking
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  // Gemini models
  "gemini": { input: 0.075, output: 0.30 },
  // Claude models
  "claude": { input: 3.0, output: 15.0 },
  // GPT models
  "gpt-4": { input: 2.5, output: 10.0 },
  "gpt-3": { input: 0.5, output: 1.5 },
  // Llama models
  "llama": { input: 0.2, output: 0.2 },
  // Default fallback
  "default": { input: 1.0, output: 3.0 },
};

function getFallbackPricing(modelId: string): { input: number; output: number } {
  const lowerModelId = modelId.toLowerCase();
  for (const [key, pricing] of Object.entries(DEFAULT_PRICING)) {
    if (key !== "default" && lowerModelId.includes(key)) {
      return pricing;
    }
  }
  return DEFAULT_PRICING.default;
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string,
  providerId?: string
): number {
  const exact = getModelById(modelId);

  // If the chat has an older or provider-normalized id that doesn't match the catalog,
  // do a best-effort fallback match by base id (strip provider prefix).
  const model =
    exact ||
    (() => {
      const targetBase = modelId.split("/").slice(1).join("/") || modelId;
      const all = getAllModels();

      // Try exact base match
      const candidates = all.filter((m) => {
        const base = m.id.split("/").slice(1).join("/") || m.id;
        return base === targetBase;
      });

      if (candidates.length === 0) {
        // Try partial/fuzzy match (model name contains the target)
        const fuzzy = all.filter((m) => {
          const base = m.id.split("/").slice(1).join("/") || m.id;
          return base.includes(targetBase) || targetBase.includes(base);
        });
        if (fuzzy.length > 0) {
          const priced = fuzzy.find((m) => (m.inputCost || 0) + (m.outputCost || 0) > 0);
          return priced || fuzzy[0];
        }
        return undefined;
      }

      if (candidates.length === 1) return candidates[0];

      // If providerId is known, try to pick the matching prefix first.
      if (providerId) {
        const preferred = candidates.find((m) => m.id.startsWith(`${providerId}/`));
        if (preferred) return preferred;
      }

      // Otherwise prefer any non-zero pricing model (avoid accidentally choosing a free/unknown entry).
      const priced = candidates.find((m) => (m.inputCost || 0) + (m.outputCost || 0) > 0);
      return priced || candidates[0];
    })();

  // Use model pricing if found, otherwise use fallback pricing
  let inputPricePer1M: number;
  let outputPricePer1M: number;

  if (model) {
    // Check if it's a free model (has :free suffix or zero pricing)
    const isFreeModel = modelId.includes(':free') || (model.inputCost === 0 && model.outputCost === 0);
    if (isFreeModel) {
      // Even for "free" models, use fallback pricing for estimation if the model has 0/0 pricing
      // This helps users understand approximate usage even on free tiers
      if (model.inputCost === 0 && model.outputCost === 0 && !modelId.includes(':free')) {
        const fallback = getFallbackPricing(modelId);
        inputPricePer1M = fallback.input;
        outputPricePer1M = fallback.output;
      } else {
        inputPricePer1M = 0;
        outputPricePer1M = 0;
      }
    } else {
      inputPricePer1M = model.inputCost;
      outputPricePer1M = model.outputCost;
    }
  } else {
    // Fallback to default pricing based on model name pattern
    const fallback = getFallbackPricing(modelId);
    inputPricePer1M = fallback.input;
    outputPricePer1M = fallback.output;
    console.warn(`[Cost] Model "${modelId}" not found in catalog, using fallback: $${fallback.input}/$${fallback.output} per 1M tokens`);
  }

  const inputCost = (inputTokens / 1_000_000) * inputPricePer1M;
  const outputCost = (outputTokens / 1_000_000) * outputPricePer1M;

  return inputCost + outputCost;
}

export function countMessagesTokens(messages: Message[]): number {
  let total = 0;

  for (const message of messages) {
    // Count message content
    total += countTokens(getTextFromMessageContent(message.content));
    // Heuristic overhead for images (exact tokenization is provider-specific).
    total += getImagesFromMessageContent(message.content).length * 200;

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
  providerId?: string,
  estimatedResponseLength: number = 500
): TokenEstimate {
  const inputTokens = countMessagesTokens(messages) + countTokens(newMessageContent);
  const estimatedOutputTokens = estimatedResponseLength;
  const totalTokens = inputTokens + estimatedOutputTokens;
  const estimatedCost = estimateCost(inputTokens, estimatedOutputTokens, modelId, providerId);

  return {
    inputTokens,
    estimatedOutputTokens,
    totalTokens,
    estimatedCost,
  };
}
