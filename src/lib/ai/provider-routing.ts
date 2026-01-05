import { CUSTOM_OPENAI_PREFIX, getProviderConfig, resolveProvider } from "@/lib/providers";

export function providerLabel(providerId: string) {
  const config = getProviderConfig(providerId);
  if (config) return config.name;
  if (providerId.startsWith(CUSTOM_OPENAI_PREFIX)) return "Custom (OpenAI-compatible)";
  return providerId;
}

export function inferProviderFromModelId(modelId: string): "openai" | "anthropic" | null {
  if (modelId.startsWith("openai/")) return "openai";
  if (modelId.startsWith("anthropic/")) return "anthropic";
  return null;
}

export function pickBestProviderId(opts: {
  modelId: string;
  availableProviderIds: string[];
}): string | null {
  const preferred = inferProviderFromModelId(opts.modelId);
  if (preferred && opts.availableProviderIds.includes(preferred)) return preferred;
  if (opts.availableProviderIds.includes("openrouter")) return "openrouter";

  const resolved = opts.availableProviderIds
    .map((id) => resolveProvider(id))
    .filter((p) => p !== null)
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
  if (providerId === "openai") return normalizeOpenAIModelId(modelId);
  // Other OpenAI-compatible providers typically don't accept OpenRouter-style prefixes.
  return normalizeOpenAIModelId(modelId);
}
