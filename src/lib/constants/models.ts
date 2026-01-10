export interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  inputCost: number; // per 1M tokens
  outputCost: number; // per 1M tokens
  category: string[];
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  description?: string;
  maxCompletionTokens?: number;
}

// Fallback model list (used when dynamic loading fails)
// These are kept as a safety net, but the system now uses dynamic loading from multiple providers
export const MODELS: Model[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    contextLength: 200000,
    inputCost: 3.0,
    outputCost: 15.0,
    category: ["balanced", "coding"],
  },
  {
    id: "anthropic/claude-3-opus",
    name: "Claude 3 Opus",
    provider: "Anthropic",
    contextLength: 200000,
    inputCost: 15.0,
    outputCost: 75.0,
    category: ["reasoning", "coding"],
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    contextLength: 128000,
    inputCost: 2.5,
    outputCost: 10.0,
    category: ["balanced", "vision"],
    supportsVision: true,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    contextLength: 128000,
    inputCost: 0.15,
    outputCost: 0.6,
    category: ["fast", "cheap"],
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash (Free)",
    provider: "Google",
    contextLength: 1000000,
    inputCost: 0.0,
    outputCost: 0.0,
    category: ["fast", "free"],
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    contextLength: 128000,
    inputCost: 0.35,
    outputCost: 0.4,
    category: ["balanced", "open-source"],
  },
  // Image Generation Models - OpenAI (via direct API only, these are fallbacks)
  // OpenRouter image models are detected dynamically via output_modalities
  {
    id: "openai/dall-e-3",
    name: "DALL-E 3",
    provider: "OpenAI",
    contextLength: 0,
    inputCost: 40.0,
    outputCost: 0,
    category: ["image-generation"],
    description: "OpenAI's advanced image generation (requires OpenAI API key)",
  },
  {
    id: "openai/dall-e-2",
    name: "DALL-E 2",
    provider: "OpenAI",
    contextLength: 0,
    inputCost: 20.0,
    outputCost: 0,
    category: ["image-generation"],
    description: "OpenAI's previous generation (requires OpenAI API key)",
  },
];

let dynamicModels: Model[] | null = null;

export function setDynamicModels(models: Model[] | null) {
  dynamicModels = models;
}

export function getAllModels(): Model[] {
  const baseModels = dynamicModels && dynamicModels.length > 0 ? dynamicModels : MODELS;

  // Always ensure hardcoded image generation models are included
  // (since they may not be returned by all provider APIs)
  const imageGenModels = MODELS.filter(m => m.category.includes("image-generation"));
  const existingIds = new Set(baseModels.map(m => m.id));

  const missingImageModels = imageGenModels.filter(m => !existingIds.has(m.id));

  return [...baseModels, ...missingImageModels];
}

export function getModelById(modelId: string): Model | undefined {
  return getAllModels().find((m) => m.id === modelId);
}

export function getModelsByCategory(category: string): Model[] {
  return getAllModels().filter((m) => m.category.includes(category));
}

export const DEFAULT_MODEL = MODELS[0]; // Claude 3.5 Sonnet
