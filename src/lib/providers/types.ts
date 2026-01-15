export type ProviderKind = "openai-compatible" | "anthropic" | "google-genai";

export type ProviderFeatureSet = {
  streaming: boolean;
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
};

export type ProviderConfig = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKeyRequired: boolean;
  priority: number; // lower = higher priority
  features: ProviderFeatureSet;
};

export type ProviderResolved = ProviderConfig & {
  baseUrl?: string;
};

