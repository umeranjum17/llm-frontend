import { streamText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { normalizeModelIdForProviderId } from "@/lib/ai/provider-routing";
import { isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import { McpManager, type ToolMetadata } from "@/lib/mcp/mcp-manager";
import type { McpServer } from "@/lib/db/schema";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";

// Node.js runtime required for MCP SDK SSE transport
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ImageDetailSchema = z.enum(["auto", "low", "high"]);

const MessageContentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  // AI SDK format for images
  z.object({
    type: z.literal("image"),
    image: z.string(),
  }),
  // Legacy OpenAI format for images (still accept for backwards compat)
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
  mcpServers: z.array(z.any()).optional(), // Config for MCP servers
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
      mcpServers = [],
    } = parsedBody.data;
    const apiKey = req.headers.get("X-API-Key");

    // Basic image size validation for data URLs.
    const MAX_IMAGE_BYTES = 1024 * 1024 * 5; // 5MB
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        let url: string | undefined;
        // Handle both AI SDK format (image) and legacy OpenAI format (image_url)
        if (part.type === "image") {
          url = part.image;
        } else if (part.type === "image_url") {
          url = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
        }
        if (!url) continue;
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

    // Get model capabilities for advanced features
    const capabilities = getModelCapabilities(modelId);
    const isAnthropicProvider = resolved.kind === "anthropic";
    const isOpenAIProvider = resolved.id === "openai";

    const model = (() => {
      if (isAnthropicProvider) {
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



    // Build tools object imperatively to avoid TypeScript spreading issues
    const allTools: Record<string, any> = {};

    // Load MCP Tools (use singleton for connection pooling)
    const mcpManager = McpManager.getInstance();
    let mcpMetadata: ToolMetadata[] = [];

    if (mcpServers && mcpServers.length > 0) {
      try {
        // Filter for enabled servers if not already done on client
        const enabledMcpServers = (mcpServers as McpServer[]).filter(s => s.enabled);
        console.log(`[MCP] Fetching tools for ${enabledMcpServers.length} enabled servers:`, enabledMcpServers.map(s => s.name).join(', '));
        const { tools: loadedTools, metadata } = await mcpManager.getTools(enabledMcpServers);
        // Add MCP tools to allTools
        Object.assign(allTools, loadedTools);
        mcpMetadata = metadata;
        console.log(`[MCP] Loaded ${Object.keys(loadedTools).length} external tools:`, Object.keys(loadedTools).join(', '));
      } catch (e) {
        console.error("[MCP] Failed to load tools:", e);
      }
    }

    // Check if we have any tools
    const hasTools = Object.keys(allTools).length > 0;

    // Build instruction messages for tools
    const toolInstructions: CoreMessage[] = [];

    // Add MCP tool instructions if any MCP tools are loaded
    if (mcpMetadata.length > 0) {
      const dynamicInstructions = mcpManager.buildToolInstructions(mcpMetadata);

      toolInstructions.push({
        role: "system",
        content: dynamicInstructions,
      });

      console.log(`[MCP] Added dynamic tool instructions for ${mcpMetadata.length} tools`);
    }

    // Stream the response
    const coreMessages = [...toolInstructions, ...messages] as unknown as CoreMessage[];

    // Request usage/cost data from providers that support it (OpenRouter, OpenAI)
    const providerOptions: Record<string, any> = {};
    if (providerId === "openrouter") {
      // OpenRouter returns actual cost when usage is requested
      providerOptions.openrouter = {
        usage: { include: true }
      };
    }

    // For Anthropic, add cache breakpoints to system messages for prompt caching
    // This marks the end of cacheable content so subsequent requests can reuse it
    if (isAnthropicProvider && capabilities.supportsPromptCaching) {
      // Mark the last system message for caching
      const lastSystemIdx = coreMessages.map((m, i) => m.role === 'system' ? i : -1).filter(i => i !== -1).pop();
      if (lastSystemIdx !== undefined && lastSystemIdx >= 0) {
        const msg = coreMessages[lastSystemIdx] as any;
        // Add cache control to mark this as cacheable
        msg.experimental_providerMetadata = {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        };
      }
      console.log('[Chat] Enabled Anthropic prompt caching');
    }

    // For models with extended thinking, configure thinking options
    if (capabilities.supportsThinking) {
      if (isAnthropicProvider) {
        // Claude models with thinking - use provider-specific options
        providerOptions.anthropic = {
          ...providerOptions.anthropic,
          thinking: { type: 'enabled', budgetTokens: 10000 }
        };
        console.log('[Chat] Enabled Anthropic extended thinking');
      }
      // Note: OpenAI o1/o3 models handle reasoning automatically
    }

    const result = streamText({
      model,
      messages: coreMessages,
      // Pass undefined instead of empty object to avoid provider compatibility issues
      tools: hasTools ? allTools : undefined,
      // Only enable multi-step if we have tools
      maxSteps: hasTools ? 5 : 1,
      // Request usage data from providers
      providerOptions,
    });

    // Return the streaming response using manual SSE for compatibility with use-chat.ts
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const part of result.fullStream) {
              // Log tool calls and results for debugging
              if (part.type === 'tool-call') {
                console.log(`[Chat] Tool call: ${part.toolName}`, part.args);
              }
              if (part.type === 'tool-result') {
                console.log(`[Chat] Tool result: ${part.toolName}`, part.result);
              }
              if (part.type === 'error') {
                console.error(`[Chat] Error in stream:`, part.error);
              }
              // Log usage data from step-finish and finish events
              if (part.type === 'step-finish' || part.type === 'finish') {
                console.log(`[Chat] ${part.type} event - usage:`, (part as any).usage);
                console.log(`[Chat] ${part.type} event - experimental_providerMetadata:`, (part as any).experimental_providerMetadata);
              }

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(part)}\n\n`)
              );
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Stream failed";
            console.error("[Chat Route] Stream error:", errorMessage);
            if (error instanceof Error && error.stack) {
              console.error("[Chat Route] Stack:", error.stack);
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: { message: errorMessage } })}\n\n`)
            );
          } finally {

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no", // Disable nginx buffering
          "Content-Encoding": "none", // Disable compression to prevent buffering
        },
      }
    );
  } catch (error) {
    console.error("Chat API error:", error);
    // Return actual error message for better debugging
    const errorMessage = error instanceof Error ? error.message : "Failed to process chat request";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
