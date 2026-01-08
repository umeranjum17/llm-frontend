import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher, ProviderModelResponse } from "./base-fetcher";

function parseUsdPer1M(value: string | number | undefined) {
  if (typeof value === "number") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

export class TogetherFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "together";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    if (!apiKey) {
      return [];
    }

    const response = await fetch("https://api.together.xyz/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Together AI API error: ${response.status}`);
    }

    const json = await response.json();
    const models = (json.data || json || []) as ProviderModelResponse[];

    return models
      .map((m) => {
        const modelId = m.id || "";
        const supportsVision = modelId.includes("vision") || modelId.includes("multimodal");
        const supportsReasoning = modelId.includes("reasoning") || modelId.includes("think");

        return {
          id: `together/${modelId}`,
          name: m.name || modelId,
          provider: "Together AI",
          contextLength: m.context_length || 4096,
          inputCost: parseUsdPer1M(m.pricing?.prompt || 0),
          outputCost: parseUsdPer1M(m.pricing?.completion || 0),
          category: [],
          supportsVision,
          supportsReasoning,
          description: m.description,
          maxCompletionTokens: m.max_completion_tokens,
        } as Model;
      })
      .filter((m) => !!m.id);
  }
}




