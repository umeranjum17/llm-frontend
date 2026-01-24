import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { withRetry } from "@/lib/ai/chat-executor";
import { createErrorResponse, createUpstreamErrorResponse } from "@/lib/utils/api-error-response";

/**
 * Available embedding models by provider
 */
const EMBEDDING_MODELS_BY_PROVIDER: Record<
  string,
  { id: string; name: string; dimensions: number }[]
> = {
  openai: [
    { id: "text-embedding-3-small", name: "text-embedding-3-small", dimensions: 1536 },
    { id: "text-embedding-3-large", name: "text-embedding-3-large", dimensions: 3072 },
    { id: "text-embedding-ada-002", name: "text-embedding-ada-002", dimensions: 1536 },
  ],
  openrouter: [
    { id: "openai/text-embedding-3-small", name: "OpenAI text-embedding-3-small", dimensions: 1536 },
    { id: "openai/text-embedding-3-large", name: "OpenAI text-embedding-3-large", dimensions: 3072 },
  ],
};

/**
 * Default models per provider
 */
const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "openai/text-embedding-3-small",
  openai: "text-embedding-3-small",
};

export async function POST(req: Request) {
  let providerId = "openrouter";
  try {
    const apiKey = req.headers.get("X-API-Key");
    const body = await req.json();
    const { texts, providerId: bodyProviderId = "openrouter", modelId: requestedModel, providerBaseUrl } = body;
    providerId = bodyProviderId;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return createErrorResponse("VALIDATION_ERROR", {
        message: "No texts provided",
        suggestion: "Provide an array of texts to generate embeddings",
      });
    }

    if (!apiKey) {
      return createErrorResponse("API_KEY_MISSING", {
        provider: providerId,
      });
    }

    // Select embedding model - use requested model or default for provider
    const modelId = requestedModel || DEFAULT_MODELS[providerId] || DEFAULT_MODELS.openrouter;

    // Find model dimensions
    const providerModels = EMBEDDING_MODELS_BY_PROVIDER[providerId] || [];
    const modelConfig = providerModels.find((m) => m.id === modelId);
    const dimensions = modelConfig?.dimensions || 1536;

    // Create provider client
    let embeddingModel;

    if (providerId === "openai") {
      const openai = createOpenAI({
        apiKey,
        baseURL: providerBaseUrl,
      });
      embeddingModel = openai.embedding(modelId);
    } else {
      // Default to OpenRouter for embeddings
      const openrouter = createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      embeddingModel = openrouter.embedding(modelId);
    }

    // Generate embeddings for all texts (with retry for transient errors like OpenRouter "User not found")
    const { embeddings } = await withRetry(
      () => embedMany({
        model: embeddingModel as any,
        values: texts,
      }),
      `embedMany (${modelId})`
    );


    return new Response(
      JSON.stringify({
        embeddings,
        modelId,
        dimensions,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Embeddings] Error:", error);
    return createUpstreamErrorResponse(error, providerId);
  }
}

/**
 * GET endpoint to check embedding service status and supported providers
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      status: "ok",
      supportedProviders: Object.keys(EMBEDDING_MODELS_BY_PROVIDER),
      modelsByProvider: EMBEDDING_MODELS_BY_PROVIDER,
      defaultModels: DEFAULT_MODELS,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
