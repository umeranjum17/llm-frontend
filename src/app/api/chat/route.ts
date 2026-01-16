import { streamText, tool, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { normalizeModelIdForProviderId } from "@/lib/ai/provider-routing";
import { isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import { McpManager, type ToolMetadata } from "@/lib/mcp/mcp-manager";
import type { McpServer } from "@/lib/db/schema";
import { getModelCapabilities, type ToolCallingTier } from "@/lib/constants/model-capabilities";

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

        // Apply enabledTools allowlist if provided
        // This allows per-chat or per-model tool restrictions
        // IMPORTANT: Only apply filter if at least one MCP tool matches, to avoid
        // accidentally zeroing out all tools when enabledTools contains non-MCP IDs
        const enabledToolsSet = enabledTools.length > 0 ? new Set(enabledTools) : null;

        if (enabledToolsSet) {
          // First, check if ANY MCP tool matches the allowlist
          const hasMatchingMcpTool = metadata.some(m =>
            enabledToolsSet.has(m.fullName) || enabledToolsSet.has(m.toolName)
          );

          if (hasMatchingMcpTool) {
            // Filter tools by allowlist
            for (const [toolName, toolDef] of Object.entries(loadedTools)) {
              // Check if tool name matches any pattern in enabledTools
              // Match by full name (provider-safe) or original tool name from metadata
              const toolMeta = metadata.find(m => m.fullName === toolName);
              const originalName = toolMeta?.toolName || toolName;

              if (enabledToolsSet.has(toolName) || enabledToolsSet.has(originalName)) {
                allTools[toolName] = toolDef;
              }
            }
            // Filter metadata too
            mcpMetadata = metadata.filter(m =>
              enabledToolsSet.has(m.fullName) || enabledToolsSet.has(m.toolName)
            );
            console.log(`[MCP] Applied enabledTools filter: ${Object.keys(allTools).length} of ${Object.keys(loadedTools).length} tools allowed`);
          } else {
            // enabledTools doesn't contain any MCP tool names - don't filter MCP tools
            // This prevents accidentally zeroing out all tools when enabledTools
            // contains only non-MCP identifiers (e.g., built-in tool names)
            Object.assign(allTools, loadedTools);
            mcpMetadata = metadata;
            console.log(`[MCP] enabledTools provided but no MCP tools matched - using all ${Object.keys(loadedTools).length} tools`);
          }
        } else {
          // No filter - use all tools
          Object.assign(allTools, loadedTools);
          mcpMetadata = metadata;
        }

        console.log(`[MCP] Loaded ${Object.keys(allTools).length} external tools:`, Object.keys(allTools).join(', '));
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
      const dynamicInstructions = mcpManager.buildToolInstructions(
        mcpMetadata,
        capabilities.toolCallingTier
      );

      toolInstructions.push({
        role: "system",
        content: dynamicInstructions,
      });

      console.log(`[MCP] Added dynamic tool instructions for ${mcpMetadata.length} tools`);
    } else if (!hasTools) {
      // No tools available - tell the model to respond without external capabilities
      toolInstructions.push({
        role: "system",
        content: "You do not have access to external tools, web search, or real-time data. Answer questions based on your training knowledge. If asked to search online, check news, or access external services, politely explain that you cannot do that in this mode and offer to help with what you know.",
      });
      console.log('[Chat] No tools available - added no-tools instruction');
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
      // Tier-based maxSteps to prevent weaker models from spiraling
      maxSteps,
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
              // Log tool calls and results for debugging
              if (part.type === 'tool-call') {
                console.log(`[Chat] Tool call: ${part.toolName}`, part.args);

                // Check for MULTI_EXECUTE_TOOL with empty/missing args (common failure)
                if (part.toolName.includes('MULTI_EXECUTE_TOOL')) {
                  const args = part.args as any;
                  if (!args?.tools || (Array.isArray(args.tools) && args.tools.length === 0)) {
                    console.warn(`[Chat] MULTI_EXECUTE_TOOL called with empty tools array`);
                  } else if (args.tools?.some((t: any) => !t.arguments || Object.keys(t.arguments).length === 0)) {
                    console.warn(`[Chat] MULTI_EXECUTE_TOOL called with empty arguments for some tools`);
                  }
                }
              }

              if (part.type === 'tool-result') {
                console.log(`[Chat] Tool result: ${part.toolName}`, part.result);

                // Track failures for retry detection
                const resultData = part.result as any;
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
