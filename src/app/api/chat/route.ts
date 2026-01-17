import { streamText, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import type { McpServer } from "@/lib/db/schema";
import { getModelCapabilities, type ToolCallingTier } from "@/lib/constants/model-capabilities";
import {
  createModel,
  loadMcpTools,
  buildToolInstructions,
} from "@/lib/ai/chat-executor";
import { countTokens } from "@/lib/utils/token-counter";

/**
 * Tier-based maxSteps for tool calling.
 *
 * Research shows weaker models spiral on multi-step tool chains (BFCL, SOP-Bench).
 * We scale maxSteps by tier to prevent this:
 * - basic: 4 steps (simple single-tool calls)
 * - advanced: 6 steps (multi-step workflows)
 * - elite: 10 steps (complex agentic patterns)
 */
function getMaxStepsByTier(tier: ToolCallingTier): number {
  switch (tier) {
    case "elite":
      return 10;
    case "advanced":
      return 6;
    case "basic":
      return 4;
    case "none":
    default:
      return 1;
  }
}

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

    // Get model capabilities for advanced features
    const capabilities = getModelCapabilities(modelId);
    const isAnthropicProvider = resolved.kind === "anthropic";

    // Create model using shared executor
    const model = createModel({
      providerId,
      providerBaseUrl,
      modelId,
      apiKey: effectiveApiKey,
    });

    // Load MCP tools using shared executor
    console.log(`[Chat] Loading MCP tools for ${mcpServers.length} servers`);
    const { tools: allTools, metadata: mcpMetadata } = await loadMcpTools(
      mcpServers as McpServer[],
      enabledTools
    );

    const hasTools = Object.keys(allTools).length > 0;
    console.log(`[Chat] Loaded ${Object.keys(allTools).length} tools`);

    // Build tool instructions using shared executor
    const toolInstructions = buildToolInstructions(
      mcpMetadata,
      capabilities.toolCallingTier,
      hasTools
    );

    if (mcpMetadata.length > 0) {
      console.log(`[Chat] Added tool instructions for ${mcpMetadata.length} tools`);
    } else if (!hasTools) {
      console.log('[Chat] No tools available - added no-tools instruction');
    }

    // Stream the response
    const coreMessages = [...toolInstructions, ...messages] as unknown as ModelMessage[];

    // === TOKEN BREAKDOWN LOGGING ===
    const tokenBreakdown = {
      systemMessages: 0,
      toolInstructions: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolSchemas: 0,
      total: 0,
    };

    // Count system messages (from context builder)
    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      const tokens = countTokens(content);

      if (msg.role === 'system') {
        tokenBreakdown.systemMessages += tokens;
      } else if (msg.role === 'user') {
        tokenBreakdown.userMessages += tokens;
      } else if (msg.role === 'assistant') {
        tokenBreakdown.assistantMessages += tokens;
      }
    }

    // Count tool instructions (separate from context builder messages)
    for (const instruction of toolInstructions) {
      if (instruction.role === 'system') {
        const content = typeof instruction.content === 'string'
          ? instruction.content
          : JSON.stringify(instruction.content);
        tokenBreakdown.toolInstructions += countTokens(content);
      }
    }

    // Estimate tool schema tokens (schemas sent to API)
    if (hasTools) {
      for (const [toolName, toolDef] of Object.entries(allTools)) {
        const schemaStr = JSON.stringify(toolDef.parameters || {});
        const descTokens = countTokens(toolDef.description || '');
        const schemaTokens = countTokens(schemaStr);
        tokenBreakdown.toolSchemas += descTokens + schemaTokens;
      }
    }

    tokenBreakdown.total =
      tokenBreakdown.systemMessages +
      tokenBreakdown.toolInstructions +
      tokenBreakdown.userMessages +
      tokenBreakdown.assistantMessages +
      tokenBreakdown.toolSchemas;

    console.log(`[Chat] 📊 TOKEN BREAKDOWN:`);
    console.log(`  System messages: ${tokenBreakdown.systemMessages}`);
    console.log(`  Tool instructions: ${tokenBreakdown.toolInstructions}`);
    console.log(`  User messages: ${tokenBreakdown.userMessages}`);
    console.log(`  Assistant messages: ${tokenBreakdown.assistantMessages}`);
    console.log(`  Tool schemas: ${tokenBreakdown.toolSchemas} (${Object.keys(allTools).length} tools)`);
    console.log(`  ESTIMATED TOTAL: ${tokenBreakdown.total}`);
    // === END TOKEN BREAKDOWN ===

    // Request usage/cost data from providers that support it (OpenRouter, OpenAI)
    const providerOptions: Record<string, any> = {};
    if (providerId === "openrouter") {
      // OpenRouter returns actual cost when usage is requested
      providerOptions.openrouter = {
        usage: { include: true }
      };
    }

    // Prompt caching configuration by provider
    // See: https://openrouter.ai/docs/guides/best-practices/prompt-caching
    //
    // Provider support:
    // - OpenRouter + Claude/Gemini: requires cache_control on content parts (not supported by AI SDK message format)
    //   → For now, we rely on Gemini's implicit caching and Claude's automatic caching via OpenRouter
    // - OpenRouter + OpenAI/Grok/DeepSeek/Groq: automatic caching (no config needed)
    // - Anthropic (direct): uses AI SDK's providerOptions.anthropic.cacheControl on messages
    // - OpenAI (direct): automatic for 1024+ tokens
    // - Google Gemini: implicit caching is automatic for 2.5+ models

    // Note: OpenRouter's AI SDK provider uses providerOptions for cache control:
    //   { type: "text", text: "...", providerOptions: { openrouter: { cacheControl: { type: "ephemeral" } } } }
    //
    // This format is compatible with the AI SDK and properly passes through to OpenRouter.

    if (providerId === 'openrouter') {
      const isGeminiModel = modelId.toLowerCase().includes('gemini');
      const isClaudeModel = modelId.toLowerCase().includes('claude');

      // Enable explicit caching for Gemini and Claude via OpenRouter
      // Uses providerOptions.openrouter.cacheControl format (AI SDK compatible)
      if (isGeminiModel || isClaudeModel) {
        // Find the last system message to add cache control breakpoint
        const lastSystemIdx = coreMessages
          .map((m, i) => m.role === 'system' ? i : -1)
          .filter(i => i !== -1)
          .pop();

        if (lastSystemIdx !== undefined && lastSystemIdx >= 0) {
          const msg = coreMessages[lastSystemIdx] as any;

          // IMPORTANT: Change role to 'user' to allow array content
          // AI SDK requires system messages to have string content
          msg.role = 'user';

          // Convert string content to array format with providerOptions
          if (typeof msg.content === 'string') {
            msg.content = [
              {
                type: 'text',
                text: msg.content,
                providerOptions: {
                  openrouter: {
                    cacheControl: { type: 'ephemeral' }
                  }
                }
              }
            ];
          } else if (Array.isArray(msg.content)) {
            // Add cacheControl to the last text part
            const lastTextPartIdx = msg.content
              .map((p: any, i: number) => p.type === 'text' ? i : -1)
              .filter((i: number) => i !== -1)
              .pop();

            if (lastTextPartIdx !== undefined && lastTextPartIdx >= 0) {
              msg.content[lastTextPartIdx].providerOptions = {
                openrouter: {
                  cacheControl: { type: 'ephemeral' }
                }
              };
            }
          }

          console.log(`[Chat] Enabled prompt caching for ${isGeminiModel ? 'Gemini' : 'Claude'} via OpenRouter (as user message)`);
        }
      } else {
        console.log(`[Chat] Using automatic prompt caching via OpenRouter (${modelId})`);
      }
    } else if (isAnthropicProvider && capabilities.supportsPromptCaching) {
      // Direct Anthropic SDK: use AI SDK's providerOptions format for cache control
      const lastSystemIdx = coreMessages
        .map((m, i) => m.role === 'system' ? i : -1)
        .filter(i => i !== -1)
        .pop();

      if (lastSystemIdx !== undefined && lastSystemIdx >= 0) {
        (coreMessages[lastSystemIdx] as any).providerOptions = {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        };
        console.log(`[Chat] Enabled prompt caching (direct Anthropic)`);
      }
    } else if (providerId === 'openai') {
      // OpenAI: automatic caching for 1024+ tokens, no config needed
      console.log(`[Chat] OpenAI automatic prompt caching enabled (1024+ tokens)`);
    }
    // Google Gemini (direct): implicit caching is automatic for 2.5+ models, no config needed

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

    // Calculate maxSteps based on model's tool calling tier
    const maxSteps = hasTools
      ? getMaxStepsByTier(capabilities.toolCallingTier)
      : 1;

    if (hasTools) {
      console.log(`[Chat] Tool calling tier: ${capabilities.toolCallingTier}, maxSteps: ${maxSteps}`);
    }

    const result = streamText({
      model,
      messages: coreMessages,
      // Pass undefined instead of empty object to avoid provider compatibility issues
      tools: hasTools ? allTools : undefined,
      // Tier-based step limit to prevent weaker models from spiraling
      stopWhen: hasTools ? stepCountIs(maxSteps) : undefined,
      // Request usage data from providers
      providerOptions,
    });

    // Return the streaming response using manual SSE for compatibility with use-chat.ts
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          // Track tool failures for retry → ask user fallback
          const toolFailures = new Map<string, number>();
          const MAX_TOOL_RETRIES = 1; // After 1 retry, suggest asking user

          try {
            for await (const part of result.fullStream) {
              // DEBUG: Log stream events (OpenRouter uses 'text' property for text-delta)
              console.log(`[Chat] Stream event: ${part.type}`,
                part.type === 'text-delta'
                  ? { text: (part as any).text?.slice(0, 50) }
                  : part.type === 'finish' || part.type === 'finish-step'
                    ? '(usage data)'
                    : part
              );

              // Log tool calls and results for debugging
              if (part.type === 'tool-call') {
                console.log(`[Chat] Tool call: ${part.toolName}`, part.input);

                // Check for MULTI_EXECUTE_TOOL with empty/missing input (common failure)
                if (part.toolName.includes('MULTI_EXECUTE_TOOL')) {
                  const input = part.input as any;
                  if (!input?.tools || (Array.isArray(input.tools) && input.tools.length === 0)) {
                    console.warn(`[Chat] MULTI_EXECUTE_TOOL called with empty tools array`);
                  } else if (input.tools?.some((t: any) => !t.arguments || Object.keys(t.arguments).length === 0)) {
                    console.warn(`[Chat] MULTI_EXECUTE_TOOL called with empty arguments for some tools`);
                  }
                }
              }

              if (part.type === 'tool-result') {
                console.log(`[Chat] Tool result: ${part.toolName}`, part.output);

                // Track failures for retry detection
                const resultData = part.output as any;
                const isError = resultData?.error ||
                  resultData?.isError ||
                  (typeof resultData === 'string' && resultData.toLowerCase().includes('error'));

                if (isError) {
                  const failCount = (toolFailures.get(part.toolName) || 0) + 1;
                  toolFailures.set(part.toolName, failCount);
                  console.warn(`[Chat] Tool ${part.toolName} failed (attempt ${failCount})`);

                  // If we've hit retry limit, emit a hint event for the frontend
                  if (failCount > MAX_TOOL_RETRIES) {
                    console.log(`[Chat] Tool ${part.toolName} exceeded retry limit, suggesting user prompt`);
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        type: "tool-retry-exhausted",
                        toolName: part.toolName,
                        failCount,
                        suggestion: "The tool failed repeatedly. Please provide more specific information or check if the required parameters are correct."
                      })}\n\n`)
                    );
                  }
                } else {
                  // Reset failure count on success
                  toolFailures.delete(part.toolName);
                }
              }

              if (part.type === 'error') {
                console.error(`[Chat] Error in stream:`, part.error);
              }

              // Log usage data (v5: usage comes through different events)
              if ((part as any).usage) {
                console.log(`[Chat] ${part.type} event - usage:`, (part as any).usage);
              }
              if ((part as any).providerMetadata) {
                console.log(`[Chat] ${part.type} event - providerMetadata:`, (part as any).providerMetadata);
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
