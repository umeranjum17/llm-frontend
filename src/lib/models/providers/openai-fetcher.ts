import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export class OpenAIFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "openai";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    if (!apiKey) {
      return [];
    }

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const json = await response.json();
    const models = (json.data || []) as OpenAIModel[];

    // Filter for chat/completion models and map to our Model format
    const chatModels = models.filter(
      (m) =>
        m.id.startsWith("gpt-") ||
        m.id.startsWith("o1") ||
        m.id.startsWith("o3") ||
        m.id.includes("chat")
    );

    return chatModels.map((m) => {
      const isVision = m.id.includes("vision") || m.id.includes("4o");
      const isReasoning = m.id.startsWith("o1") || m.id.startsWith("o3");

      // Default pricing (will be overridden by OpenRouter if available)
      const pricing: Record<string, { input: number; output: number }> = {
        "gpt-4o": { input: 2.5, output: 10.0 },
        "gpt-4o-mini": { input: 0.15, output: 0.6 },
        "gpt-4-turbo": { input: 10.0, output: 30.0 },
        "gpt-4": { input: 30.0, output: 60.0 },
        "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
      };

      let inputCost = 0;
      let outputCost = 0;
      let contextLength = 128000;

      for (const [key, value] of Object.entries(pricing)) {
        if (m.id.includes(key.replace("gpt-", ""))) {
          inputCost = value.input;
          outputCost = value.output;
          break;
        }
      }

      // Context length defaults
      if (m.id.includes("gpt-4o")) {
        contextLength = 128000;
      } else if (m.id.includes("gpt-4")) {
        contextLength = 128000;
      } else if (m.id.includes("gpt-3.5")) {
        contextLength = 16385;
      }

      return {
        id: `openai/${m.id}`,
        name: m.id.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        provider: "OpenAI",
        contextLength,
        inputCost,
        outputCost,
        category: [],
        supportsVision: isVision,
        supportsReasoning: isReasoning,
        description: `OpenAI ${m.id}`,
      } as Model;
    });
  }
}




