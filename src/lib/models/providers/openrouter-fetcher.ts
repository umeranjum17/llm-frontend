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

function parseUsdPer1M(value: string | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
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

    return models
      .map((m) => {
        const modality = (m.architecture?.modality || "").toLowerCase();
        const supportsVision = modality.includes("image");
        const supportsReasoning =
          m.id.includes("/o1") ||
          m.id.includes("/o3") ||
          /reason/i.test(m.name || "");

        const inputCost = parseUsdPer1M(m.pricing?.prompt);
        const outputCost = parseUsdPer1M(m.pricing?.completion);

        return {
          id: m.id,
          name: m.name || m.id,
          provider: deriveProvider(m.id),
          contextLength: m.context_length || 0,
          inputCost,
          outputCost,
          category: [], // Will be filled by rule engine
          supportsVision,
          supportsReasoning,
          description: m.description,
          maxCompletionTokens: m.max_completion_tokens,
        } as Model;
      })
      .filter((m) => !!m.id);
  }
}




