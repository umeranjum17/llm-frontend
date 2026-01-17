/**
 * Shared chat execution logic for both chat API and pipeline steps.
 *
 * This module provides reusable functions for:
 * - Model creation based on provider
 * - MCP tool loading and filtering
 * - Tool instruction building
 * - Memory retrieval integration
 * - Both streaming and non-streaming execution
 * - Utility model creation for simple tasks (title, summary, tags, etc.)
 */

import { streamText, generateText, generateObject, stepCountIs, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { normalizeModelIdForProviderId } from "@/lib/ai/provider-routing";
import { isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import { McpManager, type ToolMetadata } from "@/lib/mcp/mcp-manager";
import type { McpServer } from "@/lib/db/schema";
import { getModelCapabilities, type ToolCallingTier } from "@/lib/constants/model-capabilities";
import { z } from "zod";

/**
 * Retry configuration for transient API errors
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Check if an error is retryable (transient).
 * Handles OpenRouter "User not found" 401, rate limits, and server errors.
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as any;

  // Check for status code in various error formats
  const statusCode = err.status || err.statusCode || err.response?.status;
  const message = err.message || err.error?.message || "";

  // OpenRouter "User not found" - transient auth issue
  if (statusCode === 401 && message.toLowerCase().includes("user not found")) {
    return true;
  }

  // Rate limiting
  if (statusCode === 429) {
    return true;
  }

  // Server errors (500-503)
  if (statusCode >= 500 && statusCode <= 503) {
    return true;
  }

  // Network errors
  if (message.includes("ECONNRESET") || message.includes("ETIMEDOUT") || message.includes("fetch failed")) {
    return true;
  }

  return false;
}

/**
 * Execute a function with retry logic for transient errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(error)) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs
        );
        console.log(
          `[ChatExecutor] ${context} - Retryable error (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`,
          error instanceof Error ? error.message : error
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Default fast/cheap models per provider for utility tasks (title, summary, tags, etc.)
 */
export const DEFAULT_UTILITY_MODELS: Record<string, string> = {
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-haiku-20240307",
  groq: "llama-3.1-8b-instant",
  google: "gemini-1.5-flash",
};

/**
 * Tier-based maxSteps for tool calling.
 * Weaker models spiral on multi-step tool chains, so we limit them.
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

export interface ChatExecutorConfig {
  providerId: string;
  providerBaseUrl?: string;
  modelId: string;
  apiKey: string;
  systemPrompt?: string;
  mcpServers?: McpServer[];
  enabledTools?: string[];
  disabledTools?: string[]; // Tools to exclude (agent-level or step-level)
  // Memory and context options
  memoryContext?: string; // Pre-fetched memory context to include
  includeNoToolsMessage?: boolean; // Whether to add "no tools available" message
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image?: string; image_url?: any }>;
}

export interface ExecuteResult {
  text: string;
  toolCalls?: Array<{
    toolName: string;
    args: any;
    result?: any;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Create a model instance based on provider configuration.
 */
export function createModel(config: {
  providerId: string;
  providerBaseUrl?: string;
  modelId: string;
  apiKey: string;
}) {
  const { providerId, providerBaseUrl, modelId, apiKey } = config;

  const resolved = resolveProvider(providerId, { baseUrl: providerBaseUrl });
  if (!resolved) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const normalizedModelId = normalizeModelIdForProviderId(resolved.id, modelId);
  const isAnthropicProvider = resolved.kind === "anthropic";

  // Use dedicated Anthropic provider
  if (isAnthropicProvider) {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(normalizedModelId);
  }

  // Use official OpenRouter provider for OpenRouter
  // This ensures proper compatibility with OpenRouter's features including tool calling
  if (providerId === "openrouter") {
    const { createOpenRouter } = require("@openrouter/ai-sdk-provider");
    const openrouter = createOpenRouter({ apiKey });
    return openrouter(normalizedModelId);
  }

  // Use OpenAI provider for custom providers with base URL
  if (resolved.baseUrl) {
    const provider = createOpenAI({
      apiKey,
      baseURL: resolved.baseUrl,
    });
    return provider(normalizedModelId);
  }

  // Default to OpenAI
  const openai = createOpenAI({ apiKey });
  return openai(normalizedModelId);
}

/**
 * Load and filter MCP tools based on configuration.
 */
export async function loadMcpTools(
  mcpServers: McpServer[],
  enabledTools?: string[],
  disabledTools?: string[]
): Promise<{ tools: Record<string, any>; metadata: ToolMetadata[] }> {
  if (!mcpServers || mcpServers.length === 0) {
    return { tools: {}, metadata: [] };
  }

  const mcpManager = McpManager.getInstance();
  const enabledMcpServers = mcpServers.filter(s => s.enabled);

  if (enabledMcpServers.length === 0) {
    return { tools: {}, metadata: [] };
  }

  try {
    const { tools: loadedTools, metadata } = await mcpManager.getTools(enabledMcpServers);

    console.log("[ChatExecutor] loadMcpTools - loaded:", Object.keys(loadedTools).length, "tools, enabledTools filter:", enabledTools, "disabledTools filter:", disabledTools);

    // Apply enabledTools filter if provided
    const enabledToolsSet = enabledTools && enabledTools.length > 0
      ? new Set(enabledTools)
      : null;

    let filteredTools: Record<string, any> = loadedTools;
    let filteredMetadata: ToolMetadata[] = metadata;

    if (enabledToolsSet) {
      // Check if any MCP tool matches the allowlist
      const hasMatchingMcpTool = metadata.some(m =>
        enabledToolsSet.has(m.fullName) || enabledToolsSet.has(m.toolName)
      );

      if (hasMatchingMcpTool) {
        // Filter tools by allowlist
        filteredTools = {};
        for (const [toolName, toolDef] of Object.entries(loadedTools)) {
          const toolMeta = metadata.find(m => m.fullName === toolName);
          const originalName = toolMeta?.toolName || toolName;

          if (enabledToolsSet.has(toolName) || enabledToolsSet.has(originalName)) {
            filteredTools[toolName] = toolDef;
          }
        }

        filteredMetadata = metadata.filter(m =>
          enabledToolsSet.has(m.fullName) || enabledToolsSet.has(m.toolName)
        );
      }
    }

    // Apply disabledTools filter if provided
    if (disabledTools && disabledTools.length > 0) {
      const disabledSet = new Set(disabledTools);
      for (const toolName of Object.keys(filteredTools)) {
        const toolMeta = filteredMetadata.find(m => m.fullName === toolName);
        const originalName = toolMeta?.toolName || toolName;
        if (disabledSet.has(toolName) || disabledSet.has(originalName)) {
          delete filteredTools[toolName];
        }
      }
      filteredMetadata = filteredMetadata.filter(m =>
        !disabledSet.has(m.fullName) && !disabledSet.has(m.toolName)
      );
    }

    console.log("[ChatExecutor] loadMcpTools - after filtering:", Object.keys(filteredTools).length, "tools");
    return { tools: filteredTools, metadata: filteredMetadata };
  } catch (error) {
    console.error("[ChatExecutor] Failed to load MCP tools:", error);
    return { tools: {}, metadata: [] };
  }
}

/**
 * Build tool instruction messages based on loaded tools.
 */
export function buildToolInstructions(
  metadata: ToolMetadata[],
  toolCallingTier: ToolCallingTier,
  hasTools: boolean
): ModelMessage[] {
  const mcpManager = McpManager.getInstance();
  const instructions: ModelMessage[] = [];

  if (metadata.length > 0) {
    const dynamicInstructions = mcpManager.buildToolInstructions(metadata, toolCallingTier);
    instructions.push({
      role: "system",
      content: dynamicInstructions,
    });
  } else if (!hasTools) {
    instructions.push({
      role: "system",
      content: "You do not have access to external tools, web search, or real-time data. Answer questions based on your training knowledge. If asked to search online, check news, or access external services, politely explain that you cannot do that in this mode and offer to help with what you know.",
    });
  }

  return instructions;
}

/**
 * Execute a chat completion (non-streaming).
 * Used by pipeline steps for synchronous execution.
 */
export async function executeChat(
  config: ChatExecutorConfig,
  messages: ChatMessage[],
  options?: {
    maxTokens?: number;
    maxSteps?: number;
  }
): Promise<ExecuteResult> {
  const {
    providerId,
    providerBaseUrl,
    modelId,
    apiKey,
    systemPrompt,
    mcpServers,
    enabledTools,
    disabledTools,
    memoryContext,
  } = config;

  // Create model
  const model = createModel({ providerId, providerBaseUrl, modelId, apiKey });

  // Load tools
  const { tools, metadata } = await loadMcpTools(mcpServers || [], enabledTools, disabledTools);
  const hasTools = Object.keys(tools).length > 0;

  // Get model capabilities
  const capabilities = getModelCapabilities(modelId);

  // Build messages with system prompt and tool instructions
  const coreMessages: ModelMessage[] = [];

  // Add system prompt if provided
  if (systemPrompt) {
    coreMessages.push({ role: "system", content: systemPrompt });
  }

  // Add memory context if provided
  if (memoryContext) {
    coreMessages.push({
      role: "system",
      content: `Relevant context from memory:\n${memoryContext}`,
    });
  }

  // Add tool instructions
  const toolInstructions = buildToolInstructions(metadata, capabilities.toolCallingTier, hasTools);
  coreMessages.push(...toolInstructions);

  // Add user messages
  coreMessages.push(...(messages as ModelMessage[]));

  // Prompt caching configuration by provider (for non-streaming chat)
  // Uses providerOptions.openrouter.cacheControl format (AI SDK compatible)
  if (providerId === 'openrouter') {
    const isGeminiModel = modelId.toLowerCase().includes('gemini');
    const isClaudeModel = modelId.toLowerCase().includes('claude');

    if (isGeminiModel || isClaudeModel) {
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
      }
    }
  }

  // Calculate maxSteps
  const maxSteps = options?.maxSteps ?? (hasTools ? getMaxStepsByTier(capabilities.toolCallingTier) : 1);

  console.log(`[ChatExecutor] Executing chat with model: ${modelId}, tools: ${Object.keys(tools).length}, maxSteps: ${maxSteps}`);

  // Execute with retry for transient errors
  const result = await withRetry(
    () => generateText({
      model,
      messages: coreMessages,
      tools: hasTools ? tools : undefined,
      maxOutputTokens: options?.maxTokens ?? 2000,
      stopWhen: hasTools ? stepCountIs(maxSteps) : undefined,
    }),
    `generateText (${modelId})`
  );

  // Collect tool calls from all steps
  const allToolCalls: ExecuteResult["toolCalls"] = [];
  if (result.steps) {
    for (const stepResult of result.steps) {
      if (stepResult.toolCalls && stepResult.toolCalls.length > 0) {
        for (const tc of stepResult.toolCalls) {
          allToolCalls.push({
            toolName: tc.toolName,
            args: tc.input, // v5: args renamed to input
            result: stepResult.toolResults?.find((tr: any) => tr.toolCallId === tc.toolCallId)?.output, // v5: result renamed to output
          });
        }
      }
    }
  }

  console.log(`[ChatExecutor] Completed with ${allToolCalls.length} tool calls`);
  console.log(`[ChatExecutor] Result text length: ${result.text?.length || 0}, preview: ${result.text?.slice(0, 100) || 'EMPTY'}`);

  return {
    text: result.text,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    usage: result.usage ? {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? ((result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)),
    } : undefined,
  };
}

/**
 * Execute a streaming chat completion.
 * Used by the chat API for real-time responses.
 */
export async function executeChatStreaming(
  config: ChatExecutorConfig,
  messages: ChatMessage[],
  options?: {
    maxSteps?: number;
  }
) {
  const {
    providerId,
    providerBaseUrl,
    modelId,
    apiKey,
    systemPrompt,
    mcpServers,
    enabledTools,
    disabledTools,
    memoryContext,
  } = config;

  // Create model
  const model = createModel({ providerId, providerBaseUrl, modelId, apiKey });

  // Load tools
  const { tools, metadata } = await loadMcpTools(mcpServers || [], enabledTools, disabledTools);
  const hasTools = Object.keys(tools).length > 0;

  // Get model capabilities
  const capabilities = getModelCapabilities(modelId);
  const resolved = resolveProvider(providerId, { baseUrl: providerBaseUrl });
  const isAnthropicProvider = resolved?.kind === "anthropic";

  // Build messages
  const coreMessages: ModelMessage[] = [];

  if (systemPrompt) {
    coreMessages.push({ role: "system", content: systemPrompt });
  }

  if (memoryContext) {
    coreMessages.push({
      role: "system",
      content: `Relevant context from memory:\n${memoryContext}`,
    });
  }

  const toolInstructions = buildToolInstructions(metadata, capabilities.toolCallingTier, hasTools);
  coreMessages.push(...toolInstructions);
  coreMessages.push(...(messages as ModelMessage[]));

  // Provider options
  const providerOptions: Record<string, any> = {};
  if (providerId === "openrouter") {
    providerOptions.openrouter = { usage: { include: true } };
  }

  // Prompt caching configuration by provider
  // See: https://openrouter.ai/docs/guides/best-practices/prompt-caching
  //
  // For OpenRouter + Gemini/Claude: use providerOptions.openrouter.cacheControl on content parts
  // For direct Anthropic SDK: use providerOptions.anthropic.cacheControl on messages

  if (providerId === 'openrouter') {
    // OpenRouter uses providerOptions.openrouter.cacheControl for explicit caching
    const isGeminiModel = modelId.toLowerCase().includes('gemini');
    const isClaudeModel = modelId.toLowerCase().includes('claude');

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
      }
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
    }
  }
  // OpenAI, Grok, DeepSeek, Groq: automatic caching, no config needed

  // Extended thinking
  if (capabilities.supportsThinking && isAnthropicProvider) {
    providerOptions.anthropic = {
      ...providerOptions.anthropic,
      thinking: { type: 'enabled', budgetTokens: 10000 }
    };
  }

  const maxSteps = options?.maxSteps ?? (hasTools ? getMaxStepsByTier(capabilities.toolCallingTier) : 1);

  return streamText({
    model,
    messages: coreMessages,
    tools: hasTools ? tools : undefined,
    stopWhen: hasTools ? stepCountIs(maxSteps) : undefined,
    providerOptions,
  });
}

// =============================================================================
// UTILITY FUNCTIONS FOR SIMPLE ROUTES
// =============================================================================

/**
 * Validate provider and return error response if invalid.
 * Returns null if valid, or a Response object if invalid.
 */
export function validateProvider(
  providerId: string,
  providerBaseUrl?: string,
  apiKey?: string | null
): { error: Response } | { resolved: ReturnType<typeof resolveProvider> } {
  const resolved = resolveProvider(providerId, { baseUrl: providerBaseUrl });

  if (!resolved) {
    return {
      error: new Response(
        JSON.stringify({ error: "Unknown provider", providerId }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  if (isCustomOpenAIProvider(providerId) && !providerBaseUrl) {
    return {
      error: new Response(
        JSON.stringify({ error: "Missing providerBaseUrl for custom provider", providerId }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  if (resolved.apiKeyRequired && !apiKey) {
    return {
      error: new Response(
        JSON.stringify({ error: "No API key provided" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { resolved };
}

/**
 * Create a utility model for simple tasks (title, summary, tags, etc.)
 * Uses default cheap/fast models per provider.
 */
export function createUtilityModel(config: {
  providerId: string;
  providerBaseUrl?: string;
  modelId?: string; // Optional - will use default if not provided
  apiKey: string;
}) {
  const { providerId, providerBaseUrl, apiKey } = config;
  const modelId = config.modelId || DEFAULT_UTILITY_MODELS[providerId] || "gpt-4o-mini";

  return createModel({ providerId, providerBaseUrl, modelId, apiKey });
}

/**
 * Simple text generation for utility routes.
 * Handles provider options and returns text with usage info.
 */
export async function generateSimpleText(config: {
  providerId: string;
  providerBaseUrl?: string;
  modelId?: string;
  apiKey: string;
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
  };
}> {
  const { providerId, providerBaseUrl, apiKey, messages, maxTokens = 100, temperature = 0.5 } = config;
  const modelId = config.modelId || DEFAULT_UTILITY_MODELS[providerId] || "gpt-4o-mini";

  const model = createModel({ providerId, providerBaseUrl, modelId, apiKey });

  // Request usage data from OpenRouter
  const providerOptions: Record<string, any> = {};
  if (providerId === "openrouter") {
    providerOptions.openrouter = { usage: { include: true } };
  }

  const result = await withRetry(
    () => generateText({
      model,
      messages,
      maxOutputTokens: maxTokens,
      temperature,
      providerOptions,
    }),
    `generateSimpleText (${modelId})`
  );

  return {
    text: result.text,
    usage: result.usage ? {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? ((result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)),
      cost: (result.usage as any)?.cost,
    } : undefined,
  };
}

/**
 * Structured output generation for routes that need JSON responses.
 */
export async function generateStructuredOutput<T extends z.ZodType>(config: {
  providerId: string;
  providerBaseUrl?: string;
  modelId?: string;
  apiKey: string;
  prompt: string;
  schema: T;
}): Promise<{
  object: z.infer<T>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}> {
  const { providerId, providerBaseUrl, apiKey, prompt, schema } = config;
  const modelId = config.modelId || DEFAULT_UTILITY_MODELS[providerId] || "gpt-4o-mini";

  const model = createModel({ providerId, providerBaseUrl, modelId, apiKey });

  const result = await withRetry(
    () => generateObject({
      model,
      schema,
      prompt,
    }),
    `generateStructuredOutput (${modelId})`
  );

  return {
    object: result.object,
    usage: result.usage ? {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? ((result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)),
    } : undefined,
  };
}
