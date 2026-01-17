import { CUSTOM_OPENAI_PREFIX, getProviderConfig, resolveProvider } from "@/lib/providers";

export function providerLabel(providerId: string) {
  const config = getProviderConfig(providerId);
  if (config) return config.name;
  if (providerId.startsWith(CUSTOM_OPENAI_PREFIX)) return "Custom (OpenAI-compatible)";
  return providerId;
}

const DIRECT_MODEL_PREFIX_TO_PROVIDER_ID = new Set([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "mistral",
  "mistralai", // Model IDs use mistralai/ prefix
  "xai",
  "groq",
  "together",
  "perplexity",
  "anyscale",
  "meta-llama", // Llama models via Together/Groq
]);

// Map model prefixes to their native provider IDs
const MODEL_PREFIX_TO_PROVIDER: Record<string, string> = {
  "openai": "openai",
  "anthropic": "anthropic",
  "google": "google",
  "deepseek": "deepseek",
  "mistralai": "mistral",
  "mistral": "mistral",
  "xai": "xai",
  "x-ai": "xai",
  "groq": "groq",
  "together": "together",
  "perplexity": "perplexity",
  "anyscale": "anyscale",
  // Open source models - prefer Together as default host
  "meta-llama": "together",
};

export function inferDirectProviderFromModelId(modelId: string): string | null {
  const prefix = modelId.split("/")[0];
  if (!prefix) return null;
  return MODEL_PREFIX_TO_PROVIDER[prefix] || null;
}

export function isModelIdCompatibleWithProviderId(providerId: string, modelId: string): boolean {
  if (providerId === "openrouter") return true;
  if (providerId === "anthropic") return modelId.startsWith("anthropic/") || !modelId.includes("/");
  if (providerId === "openai" || providerId.startsWith(CUSTOM_OPENAI_PREFIX)) {
    return modelId.startsWith("openai/") || !modelId.includes("/");
  }
  // Google AI can serve google/ prefixed models (Gemini)
  if (providerId === "google") {
    return modelId.startsWith("google/") || !modelId.includes("/");
  }
  // DeepSeek can serve deepseek/ prefixed models
  if (providerId === "deepseek") {
    return modelId.startsWith("deepseek/") || !modelId.includes("/");
  }
  // Mistral AI can serve mistralai/ prefixed models
  if (providerId === "mistral") {
    return modelId.startsWith("mistralai/") || modelId.startsWith("mistral/") || !modelId.includes("/");
  }
  // xAI can serve xai/ prefixed models (Grok)
  if (providerId === "xai") {
    return modelId.startsWith("xai/") || modelId.startsWith("x-ai/") || !modelId.includes("/");
  }
  // Together AI can serve meta-llama/, mistralai/, deepseek/ models
  if (providerId === "together") {
    return modelId.startsWith("meta-llama/") || modelId.startsWith("mistralai/") ||
           modelId.startsWith("deepseek/") || modelId.startsWith("together/") || !modelId.includes("/");
  }
  // Groq can serve meta-llama/, mistralai/ models
  if (providerId === "groq") {
    return modelId.startsWith("meta-llama/") || modelId.startsWith("mistralai/") ||
           modelId.startsWith("groq/") || !modelId.includes("/");
  }

  const prefix = `${providerId}/`;
  return modelId.startsWith(prefix) || !modelId.includes("/");
}

export function pickBestProviderId(opts: {
  modelId: string;
  availableProviderIds: string[];
}): string | null {
  const available = opts.availableProviderIds
    .filter((id) => resolveProvider(id) !== null)
    .filter((id) => typeof id === "string" && id.length > 0);

  // Prefer the matching direct provider for the model ID (when it exists and is available).
  const direct = inferDirectProviderFromModelId(opts.modelId);
  if (direct && available.includes(direct) && isModelIdCompatibleWithProviderId(direct, opts.modelId)) {
    return direct;
  }

  // Custom OpenAI-compatible providers can generally serve OpenAI model IDs.
  if (opts.modelId.startsWith("openai/")) {
    const custom = available.find((id) => id.startsWith(CUSTOM_OPENAI_PREFIX));
    if (custom && isModelIdCompatibleWithProviderId(custom, opts.modelId)) return custom;
  }

  // OpenRouter is the broadest fallback, but only if the model can be routed through it.
  if (available.includes("openrouter") && isModelIdCompatibleWithProviderId("openrouter", opts.modelId)) {
    return "openrouter";
  }

  // Final fallback: choose the best compatible provider by priority.
  const resolved = available
    .map((id) => resolveProvider(id))
    .filter((p) => p !== null)
    .filter((p) => isModelIdCompatibleWithProviderId(p.id, opts.modelId))
    .sort((a, b) => a.priority - b.priority);

  return resolved[0]?.id ?? null;
}

function normalizeOpenAIModelId(modelId: string) {
  return modelId.startsWith("openai/") ? modelId.slice("openai/".length) : modelId;
}

const ANTHROPIC_KNOWN_MAP: Record<string, string> = {
  "anthropic/claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
  "anthropic/claude-3-opus": "claude-3-opus-20240229",
};

function normalizeAnthropicModelId(modelId: string) {
  if (ANTHROPIC_KNOWN_MAP[modelId]) return ANTHROPIC_KNOWN_MAP[modelId];

  const stripped = modelId.startsWith("anthropic/")
    ? modelId.slice("anthropic/".length)
    : modelId;

  // OpenRouter-style IDs sometimes contain dots (e.g. "claude-3.5-sonnet").
  // Anthropic model IDs use hyphens.
  return stripped.replaceAll(".", "-");
}

export function normalizeModelIdForProviderId(providerId: string, modelId: string) {
  if (providerId === "openrouter") return modelId;
  if (providerId === "anthropic") return normalizeAnthropicModelId(modelId);
  if (providerId === "openai" || providerId.startsWith(CUSTOM_OPENAI_PREFIX)) {
    return normalizeOpenAIModelId(modelId);
  }
  // Other OpenAI-compatible providers typically don't accept OpenRouter-style prefixes.
  const prefix = `${providerId}/`;
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}
