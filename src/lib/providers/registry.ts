import type { ProviderConfig, ProviderResolved } from "./types";

export const CUSTOM_OPENAI_PREFIX = "custom-openai:";

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyRequired: true,
    priority: 50,
    features: { streaming: true, vision: true, tools: true, reasoning: true },
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai-compatible",
    apiKeyRequired: true,
    priority: 10,
    features: { streaming: true, vision: true, tools: true, reasoning: true },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "anthropic",
    apiKeyRequired: true,
    priority: 10,
    features: { streaming: true, vision: true, tools: true, reasoning: true },
  },
  {
    id: "groq",
    name: "Groq",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyRequired: true,
    priority: 30,
    features: { streaming: true, vision: false, tools: true, reasoning: false },
  },
  {
    id: "together",
    name: "Together AI",
    kind: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    apiKeyRequired: true,
    priority: 30,
    features: { streaming: true, vision: true, tools: true, reasoning: false },
  },
  {
    id: "perplexity",
    name: "Perplexity",
    kind: "openai-compatible",
    baseUrl: "https://api.perplexity.ai",
    apiKeyRequired: true,
    priority: 35,
    features: { streaming: true, vision: false, tools: false, reasoning: false },
  },
  {
    id: "anyscale",
    name: "Anyscale",
    kind: "openai-compatible",
    baseUrl: "https://api.endpoints.anyscale.com/v1",
    apiKeyRequired: true,
    priority: 35,
    features: { streaming: true, vision: true, tools: true, reasoning: false },
  },
  {
    id: "google",
    name: "Google AI",
    kind: "google-genai",
    apiKeyRequired: true,
    priority: 10,
    features: { streaming: true, vision: true, tools: true, reasoning: true },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    apiKeyRequired: true,
    priority: 15,
    features: { streaming: true, vision: false, tools: true, reasoning: true },
  },
  {
    id: "mistral",
    name: "Mistral AI",
    kind: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    apiKeyRequired: true,
    priority: 20,
    features: { streaming: true, vision: true, tools: true, reasoning: false },
  },
  {
    id: "xai",
    name: "xAI",
    kind: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    apiKeyRequired: true,
    priority: 25,
    features: { streaming: true, vision: false, tools: true, reasoning: true },
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    apiKeyRequired: false,
    priority: 1,
    features: { streaming: true, vision: true, tools: false, reasoning: false },
  },
  {
    id: "lmstudio",
    name: "LM Studio (Local)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    apiKeyRequired: false,
    priority: 1,
    features: { streaming: true, vision: true, tools: false, reasoning: false },
  },
];

export function getProviderConfig(providerId: string): ProviderConfig | null {
  return PROVIDERS.find((p) => p.id === providerId) ?? null;
}

export function isCustomOpenAIProvider(providerId: string) {
  return providerId.startsWith(CUSTOM_OPENAI_PREFIX);
}

export function resolveProvider(
  providerId: string,
  opts?: { baseUrl?: string; label?: string }
): ProviderResolved | null {
  const config = getProviderConfig(providerId);
  if (config) return config;

  if (isCustomOpenAIProvider(providerId)) {
    return {
      id: providerId,
      name: opts?.label || "Custom (OpenAI-compatible)",
      kind: "openai-compatible",
      baseUrl: opts?.baseUrl,
      apiKeyRequired: true,
      priority: 40,
      features: { streaming: true, vision: true, tools: true, reasoning: true },
    };
  }

  return null;
}
