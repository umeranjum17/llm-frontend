import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

interface GroqModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export class GroqFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "groq";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    if (!apiKey) {
      return [];
    }

    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const json = await response.json();
    const models = (json.data || []) as GroqModel[];

    return models.map((m) => {
      // Groq models are typically fast inference models
      const isFast = true;
      const supportsVision = m.id.includes("vision");

      return {
        id: `groq/${m.id}`,
        name: m.id.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        provider: "Groq",
        contextLength: 32768, // Default for Groq models
        inputCost: 0.1, // Approximate - will be updated from OpenRouter
        outputCost: 0.1,
        category: [],
        supportsVision,
        supportsReasoning: false,
        description: `Groq ${m.id} - Fast inference model`,
      } as Model;
    });
  }
}




