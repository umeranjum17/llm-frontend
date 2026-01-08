import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

interface GoogleModel {
  name: string;
  displayName: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

// Google Gemini models - curated list since API may not return all
const GOOGLE_MODELS = [
  {
    id: "google/gemini-3-pro",
    name: "Gemini 3 Pro",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    supportsReasoning: true,
  },
  {
    id: "google/gemini-3-deep-think",
    name: "Gemini 3 Deep Think",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    supportsReasoning: true,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    contextLength: 1000000,
    inputCost: 0.075,
    outputCost: 0.3,
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: "google/gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    supportsReasoning: false,
  },
];

export class GoogleFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "google";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Try to fetch from Google API if key is provided
    if (apiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { cache: "no-store" }
        );

        if (response.ok) {
          const json = await response.json();
          const models = (json.models || []) as GoogleModel[];

          return models
            .filter((m) => m.name.includes("gemini"))
            .map((m) => {
              const modelId = m.name.replace("models/", "");
              return {
                id: `google/${modelId}`,
                name: m.displayName || modelId,
                provider: "Google",
                contextLength: m.inputTokenLimit || 1000000,
                inputCost: 0, // Will be filled from OpenRouter
                outputCost: 0,
                category: [],
                supportsVision: true,
                supportsReasoning: modelId.includes("deep-think"),
                description: m.description,
              } as Model;
            });
        }
      } catch (error) {
        // Fall through to curated list
      }
    }

    // Return curated list
    return GOOGLE_MODELS.map((m) => ({
      ...m,
      provider: "Google",
      category: [],
      description: `${m.name} by Google`,
    })) as Model[];
  }
}




