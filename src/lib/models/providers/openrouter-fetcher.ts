import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher, ProviderModelResponse } from "./base-fetcher";

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Parse OpenRouter pricing (per token) and convert to per 1M tokens
 * OpenRouter returns pricing like "0.000003" meaning $0.000003 per token
 * We multiply by 1,000,000 to get cost per 1M tokens
 */
function parseUsdPer1M(value: string | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Convert from per-token to per-1M tokens
  return n * 1_000_000;
}

function deriveProvider(modelId: string) {
  const prefix = modelId.split("/")[0] || "unknown";
  return titleCase(prefix);
}

export class OpenRouterFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "openrouter";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const json = await response.json();
    const models = (json.data || []) as ProviderModelResponse[];

    const result = models
      .map((m) => {
        const inputModalities = m.architecture?.input_modalities || [];
        const outputModalities = m.architecture?.output_modalities || [];

        // Vision = model accepts images as input
        const supportsVision = inputModalities.includes("image");

        // Image generation = model outputs images
        const isImageGeneration = outputModalities.includes("image");

        const supportsReasoning =
          m.id.includes("/o1") ||
          m.id.includes("/o3") ||
          /reason/i.test(m.name || "");

        const inputCost = parseUsdPer1M(m.pricing?.prompt);
        const outputCost = parseUsdPer1M(m.pricing?.completion);

        // Determine category based on output modalities
        const category: string[] = isImageGeneration ? ["image-generation"] : [];

        return {
          id: m.id,
          name: m.name || m.id,
          provider: deriveProvider(m.id),
          contextLength: isImageGeneration ? 0 : (m.context_length || 0),
          inputCost,
          outputCost,
          category,
          supportsVision,
          supportsReasoning,
          description: m.description,
          maxCompletionTokens: m.max_completion_tokens,
        } as Model;
      })
      .filter((m) => !!m.id);

    // Log image generation models found
    const imageGenModels = result.filter(m => m.category.includes("image-generation"));

    return result;
  }
}




