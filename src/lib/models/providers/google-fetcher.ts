import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./base-fetcher";

// Google Gemini curated model list matching featured.json
const GOOGLE_MODELS = [
  {
    id: "google/gemini-3-pro",
    name: "Gemini 3 Pro",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    supportsReasoning: true,
    supportsThinking: true,
    tier: "flagship",
    description: "Google's most advanced Gemini model with reasoning",
  },
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    contextLength: 1000000,
    inputCost: 0.075,
    outputCost: 0.3,
    supportsVision: true,
    tier: "fast",
    description: "Fast and efficient Gemini 3 for quick responses",
  },
  {
    id: "google/gemini-3-deep-think",
    name: "Gemini 3 Deep Think",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    supportsReasoning: true,
    supportsThinking: true,
    tier: "flagship",
    description: "Gemini 3 optimized for deep reasoning tasks",
  },
  {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    contextLength: 1000000,
    inputCost: 0.075,
    outputCost: 0.3,
    supportsVision: true,
    supportsImageGeneration: true,
    tier: "balanced",
    description: "Gemini 2.5 with image understanding and generation",
  },
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    contextLength: 1000000,
    inputCost: 0.075,
    outputCost: 0.3,
    supportsVision: true,
    tier: "fast",
    description: "Fast multimodal Gemini 2.0 model",
  },
  {
    id: "google/gemini-2.0-flash-free",
    name: "Gemini 2.0 Flash (Free)",
    contextLength: 1000000,
    inputCost: 0,
    outputCost: 0,
    supportsVision: true,
    tier: "budget",
    description: "Free tier of Gemini 2.0 Flash with rate limits",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    tier: "balanced",
    description: "Powerful Gemini 2.5 Pro with multimodal capabilities",
  },
  {
    id: "google/gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    contextLength: 1000000,
    inputCost: 1.25,
    outputCost: 5.0,
    supportsVision: true,
    tier: "balanced",
    description: "Proven Gemini 1.5 Pro with long context",
  },
  {
    id: "google/gemma-3-27b",
    name: "Gemma 3 27B",
    contextLength: 8192,
    inputCost: 0.27,
    outputCost: 0.27,
    tier: "budget",
    description: "Google's open-source Gemma model family",
  },
];

export class GoogleFetcher implements ProviderFetcher {
  getProviderId(): string {
    return "google";
  }

  async fetchModels(apiKey?: string): Promise<Model[]> {
    // Return curated list
    return GOOGLE_MODELS.map((m) => ({
      ...m,
      provider: "Google",
      category: m.supportsImageGeneration
        ? ["image-generation"]
        : m.supportsReasoning
          ? ["reasoning"]
          : [],
    })) as Model[];
  }
}
