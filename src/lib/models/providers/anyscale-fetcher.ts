import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

interface AnyscaleModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export class AnyscaleFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "anyscale";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    if (!apiKey) {
      return [];
    }

    const response = await fetch("https://api.endpoints.anyscale.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Anyscale API error: ${response.status}`);
    }

    const json = await response.json();
    const models = (json.data || []) as AnyscaleModel[];

    return models.map((m) => {
      return {
        id: `anyscale/${m.id}`,
        name: m.id.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        provider: "Anyscale",
        contextLength: 32768, // Default
        inputCost: 0.1, // Approximate
        outputCost: 0.1,
        category: [],
        supportsVision: false,
        supportsReasoning: false,
        description: `Anyscale ${m.id}`,
      } as Model;
    });
  }
}




