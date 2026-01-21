import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Mistral curated model list matching featured.json
const MISTRAL_MODELS = [
  {
    id: "mistralai/mistral-large-3",
    name: "Mistral Large 3",
    contextLength: 128000,
    inputCost: 0.5,
    outputCost: 1.5,
    supportsVision: true,
    tier: "balanced",
    description: "Mistral's flagship model with vision capabilities",
  },
  {
    id: "mistralai/mistral-medium-3",
    name: "Mistral Medium 3",
    contextLength: 128000,
    inputCost: 0.4,
    outputCost: 1.2,
    tier: "budget",
    description: "Balanced performance at affordable pricing",
  },
  {
    id: "mistralai/magistral-medium",
    name: "Magistral Medium",
    contextLength: 128000,
    inputCost: 0.6,
    outputCost: 1.8,
    supportsThinking: true,
    supportsVision: false, // Reasoning-focused model, no vision
    supportsTools: true, // Supports function calling
    tier: "balanced",
    description: "Reasoning model with step-by-step problem solving (June 2025)",
  },
  {
    id: "mistralai/magistral-small",
    name: "Magistral Small",
    contextLength: 128000,
    inputCost: 0.3,
    outputCost: 0.9,
    supportsThinking: true,
    supportsVision: false, // Reasoning-focused model, no vision
    supportsTools: true, // Supports function calling
    tier: "budget",
    description: "Compact reasoning model, 24B parameters, Apache 2.0 license",
  },
  {
    id: "mistralai/codestral-latest",
    name: "Codestral",
    contextLength: 32000,
    inputCost: 0.3,
    outputCost: 0.9,
    tier: "fast",
    description: "Specialized coding model with fast inference",
  },
];

export class MistralFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "mistral";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list
    return MISTRAL_MODELS.map((m) => ({
      ...m,
      provider: "Mistral",
      category: m.id.includes("codestral") ? ["coding"] : ["general"],
    })) as Model[];
  }
}
