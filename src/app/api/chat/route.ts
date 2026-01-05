import { streamText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { webSearch } from "@/lib/tools/web-search";
import { normalizeModelIdForProviderId } from "@/lib/ai/provider-routing";
import { isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";

export const runtime = "edge";

const ImageDetailSchema = z.enum(["auto", "low", "high"]);

const MessageContentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.union([
      z.string(),
      z.object({
        url: z.string(),
        detail: ImageDetailSchema.optional(),
      }),
    ]),
  }),
]);

const MessageContentSchema = z.union([
  z.string(),
  z.array(MessageContentPartSchema).min(1),
]);

const ChatRequestSchema = z.object({
  providerId: z.string().min(1).optional(),
  providerBaseUrl: z.string().url().optional(),
  modelId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: MessageContentSchema,
      })
    )
    .min(1),
  enabledTools: z.array(z.string()).optional(),
  webSearch: z
    .object({
      provider: z.enum(["tavily", "serper", "brave", "searxng", "mock"]).optional(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

function dataUrlBase64SizeBytes(dataUrl: string): number | null {
  if (!dataUrl.startsWith("data:")) return null;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = dataUrl.slice(5, commaIndex); // after "data:"
  if (!meta.includes(";base64")) return null;

  const base64 = dataUrl.slice(commaIndex + 1).trim();
  if (!base64) return 0;

  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedBody = ChatRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: parsedBody.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const {
      providerId: providerIdFromBody,
      providerBaseUrl,
      modelId,
      messages,
      enabledTools = [],
      webSearch: webSearchConfig,
    } = parsedBody.data;
    const apiKey = req.headers.get("X-API-Key");

    // Basic image size validation for data URLs.
    const MAX_IMAGE_BYTES = 1024 * 1024 * 5; // 5MB
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (part.type !== "image_url") continue;
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
        const bytes = dataUrlBase64SizeBytes(url);
        if (bytes !== null && bytes > MAX_IMAGE_BYTES) {
          return new Response(
            JSON.stringify({ error: "Image too large (max 5MB)" }),
            { status: 413, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    const providerId = providerIdFromBody || "openrouter";
    const resolved = resolveProvider(providerId, { baseUrl: providerBaseUrl });
    if (!resolved) {
      return new Response(
        JSON.stringify({ error: "Unknown provider", providerId }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (isCustomOpenAIProvider(providerId) && !providerBaseUrl) {
      return new Response(
        JSON.stringify({ error: "Missing providerBaseUrl for custom provider", providerId }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (resolved.apiKeyRequired && !apiKey) {
      return new Response("No API key provided", { status: 401 });
    }

    const effectiveApiKey = apiKey || "local";
    const normalizedModelId = normalizeModelIdForProviderId(resolved.id, modelId);

    const model = (() => {
      if (resolved.kind === "anthropic") {
        const anthropic = createAnthropic({ apiKey: effectiveApiKey });
        return anthropic(normalizedModelId);
      }

      if (resolved.baseUrl) {
        const openrouter = createOpenAI({
          apiKey: effectiveApiKey,
          baseURL: resolved.baseUrl,
        });
        return openrouter(normalizedModelId);
      }

      const openai = createOpenAI({ apiKey: effectiveApiKey });
      return openai(normalizedModelId);
    })();

    const toolInstructionMessages = enabledTools.includes("web-search")
      ? [
          {
            role: "system" as const,
            content:
              "If you use webSearch, call it as many times as needed (within the step limit), then include a final `Sources` section with numbered markdown links to the URLs you relied on. If you did not use webSearch, do not add a Sources section.",
          },
        ]
      : [];

    // Build tools object
    const tools = enabledTools.includes("web-search")
      ? {
        webSearch: tool({
          description: "Search the web for current information",
          parameters: z.object({
            query: z.string().describe("The search query"),
            maxResults: z.number().default(5).describe("Maximum number of results"),
          }),
          execute: async ({ query, maxResults }) => {
            return await webSearch(query, maxResults, webSearchConfig);
          },
        }),
      }
      : undefined;

    // Stream the response
    const coreMessages = [...toolInstructionMessages, ...messages] as unknown as CoreMessage[];

    const result = streamText({
      model,
      messages: coreMessages,
      tools,
      maxSteps: 5, // Enable multi-step agentic behavior
    });

    // Return the streaming response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
