import { streamText, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import type { McpServer } from "@/lib/db/schema";
import { getModelCapabilities, type ToolCallingTier } from "@/lib/constants/model-capabilities";
import {
  createModel,
  loadMcpTools,
  buildToolInstructions,
  configurePromptCaching,
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
  reasoningLevel: z.enum(["low", "medium", "high", "xhigh"]).optional(), // Reasoning level for thinking models
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
      reasoningLevel,
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
        const schemaValue =
          toolDef.inputSchema?.jsonSchema ??
          toolDef.inputSchema ??
          toolDef.parameters ??
          {};
        const schemaStr = JSON.stringify(schemaValue);
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

    // Provider options for streamText
    // Note: Usage and provider routing are now configured at model creation time
    // in chat-executor.ts via createOpenRouter() model options
    const providerOptions: Record<string, any> = {};

    // Configure prompt caching for all supported providers
    // See: https://openrouter.ai/docs/guides/best-practices/prompt-caching
    // OpenAI: Explicit caching via providerOptions.openai.promptCacheKey (1024+ tokens)
    // Anthropic: Direct provider caching via providerOptions.anthropic.cacheControl
    // OpenRouter: Explicit caching for Gemini/Claude via providerOptions.openrouter.cacheControl
    const { messages: cachedMessages, providerOptions: cacheProviderOptions } = configurePromptCaching(
      coreMessages,
      providerId,
      modelId,
      capabilities
    );
    
    // Merge cache provider options with existing provider options
    Object.assign(providerOptions, cacheProviderOptions);

    // For models with extended thinking, configure thinking options based on reasoning level
    if (capabilities.supportsThinking) {
      if (isAnthropicProvider) {
        // Map reasoning level to budget tokens for Anthropic Claude models
        // Low: 5000, Medium: 10000, High: 20000, Extra High: 50000
        const budgetTokensMap: Record<string, number> = {
          low: 5000,
          medium: 10000,
          high: 20000,
          xhigh: 50000,
        };
        const budgetTokens = budgetTokensMap[reasoningLevel || 'medium'] || 10000;
        
        providerOptions.anthropic = {
          ...providerOptions.anthropic,
          thinking: { type: 'enabled', budgetTokens }
        };
        console.log(`[Chat] Enabled Anthropic extended thinking (level: ${reasoningLevel || 'medium'}, budget: ${budgetTokens} tokens)`);
      }
      // Note: OpenAI o1/o3 models handle reasoning automatically, but we could add temperature/other params here if needed
    }

    // Calculate maxSteps based on model's tool calling tier
    const maxSteps = hasTools
      ? getMaxStepsByTier(capabilities.toolCallingTier)
      : 1;

    if (hasTools) {
      console.log(`[Chat] Tool calling tier: ${capabilities.toolCallingTier}, maxSteps: ${maxSteps}`);
    }

    const result = streamText({
      model: model as any,
      messages: cachedMessages,
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
                // Handle multiple error formats from different tools/servers
                const resultData = part.output as any;
                const isError = resultData?.error ||
                  resultData?.isError ||
                  resultData?.successful === false ||
                  resultData?.result?.error ||
                  resultData?.result?.successful === false ||
                  (typeof resultData === 'string' && resultData.toLowerCase().includes('error'));

                // Extract the actual error message for better feedback
                const errorMessage = resultData?.error ||
                  resultData?.result?.error ||
                  resultData?.message ||
                  resultData?.result?.message ||
                  (typeof resultData === 'string' ? resultData : null);

                if (isError) {
                  const failCount = (toolFailures.get(part.toolName) || 0) + 1;
                  toolFailures.set(part.toolName, failCount);
                  console.warn(`[Chat] Tool ${part.toolName} failed (attempt ${failCount}):`, errorMessage);

                  // Parse Composio-specific errors for better guidance
                  const isComposioExecuteError = part.toolName?.includes('MULTI_EXECUTE_TOOL') || part.toolName?.includes('EXECUTE_TOOL');
                  const isComposioSearchError = part.toolName?.includes('SEARCH_TOOLS');
                  const errorLower = (errorMessage || '').toLowerCase();
                  
                  // Check if this is a non-retryable error (validation, missing params, etc.)
                  const isValidationError = errorLower.includes('validation') ||
                    errorLower.includes('required') ||
                    errorLower.includes('missing') ||
                    errorLower.includes('invalid') ||
                    errorLower.includes('1 out of 1 tools failed') ||
                    errorLower.includes('tools failed');

                  // Check for "already defined" connection error - this means connection IS working
                  const isAlreadyDefinedError = errorLower.includes('already defined') ||
                    errorLower.includes('connected account already');
                  const isManageConnectionsTool = part.toolName?.includes('MANAGE_CONNECTIONS');

                  // For Composio execute errors, suggest using search first
                  let composioHint = '';
                  if (isManageConnectionsTool && isAlreadyDefinedError) {
                    // This is actually a success state - connection exists and works
                    composioHint = ' The connection IS active and working. DO NOT call MANAGE_CONNECTIONS again. Proceed to use the toolkit tools directly.';
                    // Reset failure count since this isn't a real failure
                    toolFailures.delete(part.toolName);
                    console.log(`[Chat] COMPOSIO_MANAGE_CONNECTIONS "already defined" - connection is active, clearing failure count`);

                    // Emit a special hint event to help guide the model
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        type: "connection-active-hint",
                        message: "Connection is already active. Do NOT retry COMPOSIO_MANAGE_CONNECTIONS. Proceed to execute tools with COMPOSIO_SEARCH_TOOLS → MULTI_EXECUTE_TOOL.",
                      })}\n\n`)
                    );
                  } else if (isComposioExecuteError && !isComposioSearchError) {
                    composioHint = ' Try using COMPOSIO_SEARCH_TOOLS first to find the correct tool and parameters.';
                  }

                  // If we've hit retry limit, emit a hint event for the frontend
                  if (failCount > MAX_TOOL_RETRIES) {
                    console.log(`[Chat] Tool ${part.toolName} exceeded retry limit, suggesting user prompt`);

                    // Generate specific suggestion based on error type
                    let suggestion = "The tool failed repeatedly.";
                    if (isValidationError) {
                      suggestion = `Validation error: "${errorMessage}".${composioHint} Check the tool's required parameters and ensure all required fields are provided.`;
                    } else if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
                      suggestion = "The tool timed out. Try again with a simpler request or try a different approach.";
                    } else if (errorLower.includes("rate limit") || errorLower.includes("429")) {
                      suggestion = "Rate limited. Please wait a moment before trying again.";
                    } else if (isComposioExecuteError) {
                      suggestion = `Composio execution failed: "${errorMessage}".${composioHint} Make sure you're using the correct tool_slug and all required arguments from the search results.`;
                    } else {
                      suggestion = `Error: "${errorMessage}".${composioHint} Consider using a different tool or approach.`;
                    }

                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        type: "tool-retry-exhausted",
                        toolName: part.toolName,
                        failCount,
                        error: errorMessage,
                        suggestion,
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

              // Log usage data and cache metrics
              if ((part as any).usage) {
                const usage = (part as any).usage;
                const cachedTokens = usage.promptTokensDetails?.cachedTokens ?? 0;
                const promptTokens = usage.inputTokens ?? 0;
                
                if (cachedTokens > 0) {
                  const cacheHitRate = ((cachedTokens / promptTokens) * 100).toFixed(1);
                  console.log(`[PromptCache] ✅ Cache hit: ${cachedTokens}/${promptTokens} tokens cached (${cacheHitRate}% hit rate)`);
                }
                
                console.log(`[Chat] ${part.type} event - usage:`, usage);
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
