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
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { normalizeModelIdForProviderId } from "@/lib/ai/provider-routing";
import { isCustomOpenAIProvider, resolveProvider } from "@/lib/providers";
import { McpManager, type ToolMetadata } from "@/lib/mcp/mcp-manager";
import type { McpServer } from "@/lib/db/schema";
import { getModelCapabilities, type ToolCallingTier } from "@/lib/constants/model-capabilities";
import { z } from "zod";
import { countTokens } from "@/lib/utils/token-counter";

/**
 * Deep sanitize tool schema to fix Azure-incompatible values.
 * Azure OpenAI rejects schemas with type: "None" anywhere in the tree.
 * This is called from the fetch interceptor BEFORE the request is sent.
 */
function deepSanitizeToolSchema(obj: any): any {
  if (obj === null || obj === undefined) {
    return { type: "object", properties: {}, required: [] };
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitizeToolSchema(item));
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      const lower = obj.toLowerCase();
      if (lower === 'none' || lower === 'nonetype') {
        return 'string';
      }
    }
    return obj;
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'type') {
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'none' || lower === 'nonetype' || lower === 'null') {
          console.warn(`[OpenRouter Sanitize] Fixed invalid type "${value}" -> "string"`);
          result[key] = 'string';
          continue;
        }
      }
      if (value === null || value === undefined) {
        console.warn(`[OpenRouter Sanitize] Fixed null/undefined type -> "string"`);
        result[key] = 'string';
        continue;
      }
    }
    result[key] = deepSanitizeToolSchema(value);
  }

  // Ensure root has type: "object" if it's meant to be an object schema
  if (result.properties && !result.type) {
    result.type = 'object';
  }

  return result;
}

/**
 * Retry configuration for transient API errors
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Provider-specific timeout configuration (in milliseconds)
 * Based on documented API limits and best practices
 */
export const PROVIDER_TIMEOUTS: Record<string, number> = {
  groq: 20000,       // 20s - Groq has fast inference but strict timeouts
  deepseek: 60000,   // 60s - DeepSeek allows longer requests
  default: 120000,   // 2 minutes - default for other providers
};

/**
 * Generate a cache key from system prompt content for prompt caching.
 * Uses a simple hash of the content to create a stable key.
 */
function generatePromptCacheKey(systemPrompts: ModelMessage[]): string {
  const content = systemPrompts
    .filter(m => m.role === 'system')
    .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    .join('\n');
  
  // Simple hash function for cache key
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `prompt-${Math.abs(hash).toString(36)}`;
}

/**
 * Calculate total tokens in system messages for prompt caching eligibility.
 * OpenAI requires 1024+ tokens for prompt caching to activate.
 */
function getSystemPromptTokens(messages: ModelMessage[]): number {
  return messages
    .filter(m => m.role === 'system')
    .reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + countTokens(content);
    }, 0);
}

/**
 * Configure prompt caching for different providers.
 * Returns updated messages and provider options with caching enabled.
 */
export function configurePromptCaching(
  messages: ModelMessage[],
  providerId: string,
  modelId: string,
  capabilities: ReturnType<typeof getModelCapabilities>,
  options?: { cacheTTL?: '5m' | '1h' | '24h' }
): { messages: ModelMessage[]; providerOptions: Record<string, any> } {
  const providerOptions: Record<string, any> = {};
  const updatedMessages = [...messages];

  const systemPrompts = updatedMessages.filter(m => m.role === 'system');
  const systemTokens = getSystemPromptTokens(systemPrompts);

  // OpenAI: Explicit prompt caching for supported models with 1024+ token prompts
  // Note: All gpt-4o+ models cache automatically. Only gpt-4o, gpt-4o-mini accept
  // the explicit prompt_cache_retention parameter per Vercel AI SDK v3.0.12.
  // Models like gpt-5-mini support caching but reject the explicit parameter.
  if (providerId === 'openai' && systemTokens >= 1024) {
    // Only set explicit parameter for models that support it
    if (capabilities.supportsExplicitCacheParameter) {
      const cacheKey = generatePromptCacheKey(systemPrompts);
      providerOptions.openai = {
        promptCacheKey: cacheKey,
        promptCacheRetention: 'in_memory',
      };
    }
    // Else: OpenAI handles caching automatically (no parameter needed)
  }

  // Anthropic: Direct provider prompt caching using cumulative token counting
  // Anthropic caches the entire PREFIX up to the breakpoint, not individual messages
  // The cumulative prefix must be >= 1024 tokens for caching to activate
  // NOTE: AI SDK expects message.providerOptions.anthropic.cacheControl for system messages
  else if (providerId === 'anthropic' && capabilities.supportsPromptCaching) {
    const ANTHROPIC_MIN_CACHE_TOKENS = 1024;
    const cacheTTL = options?.cacheTTL ?? '5m';
    const cacheControl = {
      type: 'ephemeral' as const,
      ...(cacheTTL !== '5m' && { ttl: cacheTTL })
    };

    // Calculate cumulative tokens at each message index
    const cumulativeTokens: number[] = [];
    let runningTotal = 0;
    for (const msg of updatedMessages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      runningTotal += countTokens(content);
      cumulativeTokens.push(runningTotal);
    }

    // Helper to add cacheControl to a message
    // For system messages: AI SDK uses message.providerOptions (content stays as string)
    // For user/assistant messages with array content: add to last text part's providerOptions
    const addCacheControlToMessage = (msg: any) => {
      if (msg.role === 'system') {
        // System messages: SDK uses message.providerOptions, keep content as string
        msg.providerOptions = {
          anthropic: { cacheControl }
        };
      } else if (Array.isArray(msg.content)) {
        // User/assistant with array content: add to last text part
        const lastTextIdx = msg.content
          .map((p: any, i: number) => p.type === 'text' ? i : -1)
          .filter((i: number) => i !== -1)
          .pop();
        if (lastTextIdx !== undefined && lastTextIdx >= 0) {
          msg.content[lastTextIdx].providerOptions = {
            anthropic: { cacheControl }
          };
        }
      } else if (typeof msg.content === 'string') {
        // User/assistant with string content: convert to array with cacheControl on part
        msg.content = [{
          type: 'text',
          text: msg.content,
          providerOptions: {
            anthropic: { cacheControl }
          }
        }];
      }
    };

    // ================================================================
    // CACHING STRATEGY FOR ANTHROPIC WITH DYNAMIC CONTEXT
    // ================================================================
    // Message structure (set by use-chat.ts):
    //   [system..., user1, asst1, user2, asst2, ..., asst_n, current_user_with_memory]
    //
    // Memory/RAG is injected into the CURRENT user message only.
    // All PREVIOUS messages (system, user1-n, asst1-n) are STABLE (raw from DB).
    //
    // Cache strategy:
    //   1. Cache at LAST ASSISTANT message (stable prefix up to previous turn)
    //   2. If no assistant yet, cache at last SYSTEM message
    //   3. Skip the CURRENT user message (has dynamic memory)
    //
    // This enables incremental caching:
    //   Turn 2: [system, user1, asst1*, user2_mem] → cache prefix [system, user1, asst1]
    //   Turn 3: [system, user1, asst1, user2, asst2*, user3_mem] → cache HIT + extend
    //   Turn 4: [system, ..., asst3*, user4_mem] → cache HIT on longer prefix
    // ================================================================

    // Find indices by role
    const systemIndices = updatedMessages
      .map((m, i) => m.role === 'system' ? i : -1)
      .filter(i => i !== -1);
    const assistantIndices = updatedMessages
      .map((m, i) => m.role === 'assistant' ? i : -1)
      .filter(i => i !== -1);

    const lastSystemIdx = systemIndices.length > 0 ? systemIndices[systemIndices.length - 1] : undefined;
    const lastAssistantIdx = assistantIndices.length > 0 ? assistantIndices[assistantIndices.length - 1] : undefined;

    // Determine best cache breakpoint: prefer last assistant (includes conversation history)
    let cacheBreakpointIdx: number | undefined = undefined;
    let cacheLocation = 'none';

    // First choice: last assistant message (maximizes cached prefix)
    if (lastAssistantIdx !== undefined && cumulativeTokens[lastAssistantIdx] >= ANTHROPIC_MIN_CACHE_TOKENS) {
      cacheBreakpointIdx = lastAssistantIdx;
      cacheLocation = 'assistant';
    }
    // Fallback: last system message
    else if (lastSystemIdx !== undefined && cumulativeTokens[lastSystemIdx] >= ANTHROPIC_MIN_CACHE_TOKENS) {
      cacheBreakpointIdx = lastSystemIdx;
      cacheLocation = 'system';
    }

    // Apply cache_control
    if (cacheBreakpointIdx !== undefined) {
      addCacheControlToMessage(updatedMessages[cacheBreakpointIdx]);
      console.log(`[Cache] Anthropic: Caching at ${cacheLocation} idx ${cacheBreakpointIdx} (${cumulativeTokens[cacheBreakpointIdx]} tokens)`);
    } else {
      const maxTokens = Math.max(
        lastAssistantIdx !== undefined ? cumulativeTokens[lastAssistantIdx] : 0,
        lastSystemIdx !== undefined ? cumulativeTokens[lastSystemIdx] : 0
      );
      console.log(`[Cache] Anthropic: No cache (max prefix ${maxTokens} tokens < ${ANTHROPIC_MIN_CACHE_TOKENS} minimum)`);
    }

    // Log message counts
    const userCount = updatedMessages.filter(m => m.role === 'user').length;
    console.log(`[Cache] Anthropic: ${systemIndices.length} system, ${userCount} user, ${assistantIndices.length} assistant msgs`);
  }
  
  // OpenRouter: Explicit caching for Gemini/Claude/OpenAI models using cumulative tokens
  else if (providerId === 'openrouter') {
    const isGeminiModel = modelId.toLowerCase().includes('gemini');
    const isClaudeModel = modelId.toLowerCase().includes('claude');
    const isOpenAIModel = modelId.toLowerCase().includes('openai/') || modelId.toLowerCase().startsWith('gpt-');

    // Enable caching for all supported models (Gemini, Claude, OpenAI)
    const supportsCaching = isGeminiModel || isClaudeModel || isOpenAIModel;

    if (supportsCaching) {
      // Calculate cumulative tokens (same approach as Anthropic)
      const OPENROUTER_MIN_CACHE_TOKENS = 1024;
      let runningTotal = 0;
      const cumulativeTokens: number[] = [];
      for (const msg of updatedMessages) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        runningTotal += countTokens(content);
        cumulativeTokens.push(runningTotal);
      }

      // Find indices for cache breakpoint candidates
      const assistantIndices = updatedMessages
        .map((m, i) => m.role === 'assistant' ? i : -1)
        .filter(i => i !== -1);
      const systemIndices = updatedMessages
        .map((m, i) => m.role === 'system' ? i : -1)
        .filter(i => i !== -1);

      const lastAssistantIdx = assistantIndices.length > 0 ? assistantIndices[assistantIndices.length - 1] : undefined;
      const lastSystemIdx = systemIndices.length > 0 ? systemIndices[systemIndices.length - 1] : undefined;

      // Find best cache breakpoint - prefer last assistant (maximizes cached prefix across turns)
      let cacheBreakpointIdx = -1;
      let cacheLocation = 'none';

      // First choice: last assistant message (stable across turns, maximizes cache hits)
      if (lastAssistantIdx !== undefined && cumulativeTokens[lastAssistantIdx] >= OPENROUTER_MIN_CACHE_TOKENS) {
        cacheBreakpointIdx = lastAssistantIdx;
        cacheLocation = 'assistant';
      }
      // Fallback: last system message
      else if (lastSystemIdx !== undefined && cumulativeTokens[lastSystemIdx] >= OPENROUTER_MIN_CACHE_TOKENS) {
        cacheBreakpointIdx = lastSystemIdx;
        cacheLocation = 'system';
      }

      if (cacheBreakpointIdx >= 0) {
        const originalMsg = updatedMessages[cacheBreakpointIdx];

        // Clone message to avoid mutating original
        const msg: any = { ...originalMsg };

        // For system messages, change role to 'user' to allow array content with providerOptions
        // AI SDK requires system messages to have string content
        if (msg.role === 'system') {
          msg.role = 'user';
        }

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
          // Clone content array and add cacheControl to the last text part
          msg.content = [...msg.content];
          const lastTextPartIdx = msg.content
            .map((p: any, i: number) => p.type === 'text' ? i : -1)
            .filter((i: number) => i !== -1)
            .pop();

          if (lastTextPartIdx !== undefined && lastTextPartIdx >= 0) {
            msg.content[lastTextPartIdx] = {
              ...msg.content[lastTextPartIdx],
              providerOptions: {
                openrouter: {
                  cacheControl: { type: 'ephemeral' }
                }
              }
            };
          }
        }

        // Replace message in array with cloned version
        updatedMessages[cacheBreakpointIdx] = msg;
        console.log(`[Cache] OpenRouter: Caching at ${cacheLocation} idx ${cacheBreakpointIdx} (${cumulativeTokens[cacheBreakpointIdx]} cumulative tokens)`);
      }
    }
    // Note: Groq, DeepSeek, xAI have automatic caching - no explicit config needed
  }

  // Google: Implicit caching for Gemini 2.5+ (automatic, 75-90% discount)
  // No explicit configuration needed - just ensure system messages are at the beginning
  // Cache metrics available via providerMetadata.google.usageMetadata.cachedContentTokenCount
  else if (providerId === 'google') {
    // Gemini 2.5+ automatically caches prompts >=1024 tokens (2.5 Flash) or >=2048 tokens (2.5 Pro)
    // No explicit configuration needed - caching happens automatically
    // Cache savings: 90% on Gemini 2.5 models, 75% on Gemini 2.0 models
    console.log('[Cache] Google: Using implicit caching (75-90% savings on 2.5+ models)');
  }

  return { messages: updatedMessages, providerOptions };
}

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

  // Request Timeout
  if (statusCode === 408) {
    return true;
  }

  // Rate limiting
  if (statusCode === 429) {
    return true;
  }

  // Server errors (500-504)
  if (statusCode >= 500 && statusCode <= 504) {
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
        // Add jitter to prevent thundering herd (0-30% random variance)
        const jitter = Math.random() * 0.3;
        const baseDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
        const delay = Math.min(
          baseDelay * (1 + jitter),
          RETRY_CONFIG.maxDelayMs
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
 * Each provider uses their own cheapest capable model for background tasks.
 */
export const DEFAULT_UTILITY_MODELS: Record<string, string> = {
  openrouter: "openai/gpt-5-nano",
  openai: "gpt-5-nano",
  anthropic: "claude-3-haiku-20240307",
  google: "gemini-2.0-flash-001",
  groq: "llama-3.1-8b-instant",
  deepseek: "deepseek-chat-v3-0324",
  mistral: "mistral-medium-3",
  xai: "grok-code-fast-1",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  perplexity: "sonar",
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
  // Reasoning/thinking options
  reasoningLevel?: "low" | "medium" | "high" | "xhigh";
}

/**
 * Map reasoning level to budget tokens for extended thinking.
 * Must stay in sync with the mapping in /api/chat/route.ts
 */
function getReasoningBudgetTokens(level?: "low" | "medium" | "high" | "xhigh"): number {
  switch (level) {
    case "low":
      return 5000;
    case "medium":
      return 10000;
    case "high":
      return 20000;
    case "xhigh":
      return 50000;
    default:
      return 10000; // Default to medium
  }
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
  const isGoogleProvider = resolved.kind === "google-genai";

  // Use dedicated Anthropic provider
  if (isAnthropicProvider) {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(normalizedModelId);
  }

  // Use dedicated Google provider for Gemini models
  // Supports implicit caching (75-90% discount on Gemini 2.5+)
  if (isGoogleProvider || providerId === "google") {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(normalizedModelId);
  }

  // Use dedicated xAI provider for Grok models
  // Supports reasoning via reasoningEffort parameter
  if (resolved.kind === "xai" || providerId === "xai") {
    const xai = createXai({ apiKey });
    return xai(normalizedModelId);
  }

  // Use OpenAI-compatible provider for DeepSeek
  // DeepSeek only supports Chat Completions API, not the new Responses API
  // The @ai-sdk/openai-compatible package uses chat completions by default
  if (providerId === "deepseek") {
    const deepseek = createOpenAICompatible({
      name: "deepseek",
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
    return deepseek(normalizedModelId);
  }

  // Use stable OpenRouter provider (v1.5.4) which uses Chat Completions API
  // The v6 alpha provider uses Responses API which has Azure tool schema bugs
  // We add a custom fetch to intercept and sanitize tool schemas before they reach Azure
  if (providerId === "openrouter") {
    const openrouter = createOpenRouter({
      apiKey,
      // Custom fetch to sanitize tool schemas - Azure rejects type: "None"
      fetch: async (url, options) => {
        if (options?.body && typeof options.body === 'string') {
          try {
            const body = JSON.parse(options.body);

            // Sanitize tools array if present
            if (body.tools && Array.isArray(body.tools)) {
              body.tools = body.tools.map((tool: any) => {
                if (tool.function?.parameters) {
                  // Deep sanitize the parameters schema
                  const sanitized = deepSanitizeToolSchema(tool.function.parameters);
                  return {
                    ...tool,
                    function: {
                      ...tool.function,
                      parameters: sanitized
                    }
                  };
                }
                return tool;
              });

            }

            options = {
              ...options,
              body: JSON.stringify(body)
            };
          } catch (e) {
            console.error('[OpenRouter] Failed to sanitize request body:', e);
          }
        }
        return globalThis.fetch(url, options);
      }
    });
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

    return { tools: filteredTools, metadata: filteredMetadata };
  } catch (error) {
    console.error("[ChatExecutor] Failed to load MCP tools:", error);
    return { tools: {}, metadata: [] };
  }
}

/**
 * Build tool instruction messages based on loaded tools.
 * When no tools are available, returns empty array to avoid injecting unnecessary prompts.
 */
export function buildToolInstructions(
  metadata: ToolMetadata[],
  toolCallingTier: ToolCallingTier,
  hasTools: boolean
): ModelMessage[] {
  // Don't inject anything if no tools available
  if (!hasTools && metadata.length === 0) {
    return [];
  }

  const mcpManager = McpManager.getInstance();
  const instructions: ModelMessage[] = [];

  if (metadata.length > 0) {
    const dynamicInstructions = mcpManager.buildToolInstructions(metadata, toolCallingTier);
    instructions.push({
      role: "system",
      content: dynamicInstructions,
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

  // Configure prompt caching for all supported providers
  const { messages: cachedMessages, providerOptions: cacheProviderOptions } = configurePromptCaching(
    coreMessages,
    providerId,
    modelId,
    capabilities
  );
  
  // Merge cache provider options with any existing provider options
  const finalProviderOptions = { ...cacheProviderOptions };

  // Calculate maxSteps
  const maxSteps = options?.maxSteps ?? (hasTools ? getMaxStepsByTier(capabilities.toolCallingTier) : 1);


  // Execute with retry for transient errors
  const result = await withRetry(
    () => generateText({
      model: model as any,
      messages: cachedMessages,
      tools: hasTools ? tools : undefined,
      maxOutputTokens: options?.maxTokens ?? 2000,
      stopWhen: hasTools ? stepCountIs(maxSteps) : undefined,
      providerOptions: Object.keys(finalProviderOptions).length > 0 ? finalProviderOptions : undefined,
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


  // Log prompt cache metrics if available
  if (result.usage) {
    const usage = result.usage as any;
    const cachedTokens = usage.promptTokensDetails?.cachedTokens ?? 0;
    const promptTokens = result.usage.inputTokens ?? 0;

    // OpenAI/Anthropic cache metrics
    if (cachedTokens > 0) {
      const cacheHitRate = ((cachedTokens / promptTokens) * 100).toFixed(1);
      console.log(`[Cache] ${providerId}/${modelId}: ${cacheHitRate}% hit rate (${cachedTokens}/${promptTokens} tokens)`);
    }

    // Groq cache metrics (usage.cache_* fields)
    if (usage.cache_creation_input_tokens || usage.cache_read_input_tokens) {
      const cacheCreated = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      console.log(`[Cache] Groq: Created ${cacheCreated} tokens, Read ${cacheRead} tokens (automatic caching)`);
    }

    // DeepSeek cache metrics (prompt_cache_hit_tokens, prompt_cache_miss_tokens)
    if (usage.prompt_cache_hit_tokens || usage.prompt_cache_miss_tokens) {
      const hitTokens = usage.prompt_cache_hit_tokens ?? 0;
      const missTokens = usage.prompt_cache_miss_tokens ?? 0;
      const total = hitTokens + missTokens;
      const hitRate = total > 0 ? ((hitTokens / total) * 100).toFixed(1) : '0.0';
      console.log(`[Cache] DeepSeek: ${hitRate}% hit rate (${hitTokens}/${total} tokens, 90% cost savings on hits)`);
    }

    // xAI cache metrics (similar structure expected)
    if (usage.cache_tokens || usage.cached_tokens) {
      const cached = usage.cache_tokens ?? usage.cached_tokens ?? 0;
      const hitRate = promptTokens > 0 ? ((cached / promptTokens) * 100).toFixed(1) : '0.0';
      console.log(`[Cache] xAI: ${hitRate}% hit rate (${cached}/${promptTokens} tokens, automatic caching)`);
    }
  }

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
    reasoningLevel,
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

  // Configure prompt caching for all supported providers
  const { messages: cachedMessages, providerOptions: cacheProviderOptions } = configurePromptCaching(
    coreMessages,
    providerId,
    modelId,
    capabilities
  );

  // Merge cache provider options with existing provider options
  Object.assign(providerOptions, cacheProviderOptions);

  // Extended thinking with configurable reasoning level
  if (capabilities.supportsThinking) {
    if (isAnthropicProvider) {
      // Anthropic: budgetTokens configuration
      const budgetTokens = getReasoningBudgetTokens(reasoningLevel);
      providerOptions.anthropic = {
        ...providerOptions.anthropic,
        thinking: { type: 'enabled', budgetTokens }
      };

      // Interleaved thinking (beta): Enable thinking during tool use for Claude 4+ models
      // Requires beta header for Claude 4 models when using tools
      const isClaude4 = modelId.toLowerCase().includes('claude-4') || modelId.toLowerCase().includes('claude-opus-4') || modelId.toLowerCase().includes('claude-sonnet-4');
      const hasTools = Object.keys(tools).length > 0;
      if (isClaude4 && hasTools) {
        providerOptions.anthropic = {
          ...providerOptions.anthropic,
          headers: {
            ...providerOptions.anthropic?.headers,
            'anthropic-beta': 'interleaved-thinking-2025-05-14'
          }
        };
      }
    } else if (providerId === 'openai') {
      // OpenAI o3/o4: reasoningEffort and reasoningSummary parameters
      const reasoningEffortMap: Record<string, string> = {
        low: 'low',
        medium: 'medium',
        high: 'high',
        xhigh: 'high', // Map xhigh to high (OpenAI max)
      };
      providerOptions.openai = {
        ...providerOptions.openai,
        reasoningEffort: reasoningEffortMap[reasoningLevel || 'medium'] || 'medium',
        // NOTE: reasoningSummary: 'detailed' requires verified OpenAI organization
        // See: https://platform.openai.com/settings/organization/general
        // Without it, reasoning happens internally but content isn't streamed
      };
    } else if (providerId === 'google') {
      // Google Gemini: thinking configuration depends on model version
      // Gemini 3+: Use thinking_level (low/medium/high/max)
      // Gemini 2.5: Use thinking_budget (token-based, 0-32768)
      const isGemini3 = modelId.toLowerCase().includes('gemini-3') || modelId.toLowerCase().includes('gemini-flash-3');
      const isGemini25 = modelId.toLowerCase().includes('gemini-2.5') || modelId.toLowerCase().includes('gemini-flash-2.5');

      if (isGemini3) {
        // Gemini 3: Use thinking_level
        const thinkingLevelMap: Record<string, string> = {
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'max', // Gemini 3 supports 'max' level
        };
        providerOptions.google = {
          ...providerOptions.google,
          thinkingLevel: thinkingLevelMap[reasoningLevel || 'medium'] || 'medium'
        };
      } else if (isGemini25) {
        // Gemini 2.5: Use thinking_budget (token-based)
        const budgetTokens = getReasoningBudgetTokens(reasoningLevel);
        providerOptions.google = {
          ...providerOptions.google,
          thinkingBudget: budgetTokens
        };
      } else {
        // Fallback: Use thinking_level for unknown versions
        const thinkingLevelMap: Record<string, string> = {
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'high',
        };
        providerOptions.google = {
          ...providerOptions.google,
          thinkingLevel: thinkingLevelMap[reasoningLevel || 'medium'] || 'medium'
        };
      }
    } else if (providerId === 'deepseek') {
      // DeepSeek: Enable thinking mode
      providerOptions.deepseek = {
        ...providerOptions.deepseek,
        thinking: { type: 'enabled' }
      };
    } else if (providerId === 'mistral') {
      // Mistral Magistral: Reasoning enabled automatically for magistral models
      // Output format: <think>...</think> tags (older -2506) or tokenized chunks (newer -2507/2509)
      // No explicit configuration needed - models auto-enable reasoning
      console.log('[Thinking] Mistral Magistral: Reasoning enabled automatically');
    } else if (providerId === 'xai') {
      // xAI Grok: reasoning_effort supported on grok-3, grok-3-mini, grok-4
      // Uses low/high values
      const isGrok3OrNewer = modelId.toLowerCase().includes('grok-3') ||
                             modelId.toLowerCase().includes('grok-4');

      if (isGrok3OrNewer) {
        const reasoningEffortMap: Record<string, string> = {
          low: 'low',
          medium: 'high', // Map medium to high (only low/high supported)
          high: 'high',
          xhigh: 'high',
        };
        providerOptions.xai = {
          ...providerOptions.xai,
          reasoningEffort: reasoningEffortMap[reasoningLevel || 'high'] || 'high'
        };
      }
    } else if (providerId === 'openrouter') {
      // OpenRouter: Provider-specific routing based on model ID
      if (modelId.includes('anthropic/')) {
        const budgetTokens = getReasoningBudgetTokens(reasoningLevel);
        providerOptions.openrouter = {
          ...providerOptions.openrouter,
          reasoning: { max_tokens: budgetTokens }
        };
      } else if (modelId.includes('openai/')) {
        const reasoningEffortMap: Record<string, string> = {
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'high'
        };
        providerOptions.openrouter = {
          ...providerOptions.openrouter,
          reasoning_effort: reasoningEffortMap[reasoningLevel || 'medium']
        };
      } else if (modelId.includes('google/')) {
        const thinkingLevelMap: Record<string, string> = {
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'high'
        };
        providerOptions.openrouter = {
          ...providerOptions.openrouter,
          thinking_level: thinkingLevelMap[reasoningLevel || 'medium']
        };
      } else if (modelId.includes('deepseek/')) {
        providerOptions.openrouter = {
          ...providerOptions.openrouter,
          thinking: { type: 'enabled' }
        };
      } else if (modelId.includes('x-ai/')) {
        const reasoningLevelMap: Record<string, string> = {
          low: 'low',
          medium: 'medium',
          high: 'high',
          xhigh: 'high'
        };
        providerOptions.openrouter = {
          ...providerOptions.openrouter,
          reasoning_level: reasoningLevelMap[reasoningLevel || 'medium']
        };
      }
    }
  }

  const maxSteps = options?.maxSteps ?? (hasTools ? getMaxStepsByTier(capabilities.toolCallingTier) : 1);

  return streamText({
    model: model as any,
    messages: cachedMessages,
    tools: hasTools ? tools : undefined,
    stopWhen: hasTools ? stepCountIs(maxSteps) : undefined,
    providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
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
      model: model as any,
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
      model: model as any,
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
