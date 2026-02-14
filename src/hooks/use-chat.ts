import { useState, useCallback, useRef, useEffect } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { useStreamingStore, type ActiveSkill, type PendingSkillApproval, type ImageGenerationStage, type ContextCompactionState } from "@/stores/streaming-store";
import { useComposioStore, selectHasValidSession } from "@/stores/composio-store";
import { addMessage, updateChat, getChatById, updateMessage, getMessagesForBranch, getLastMessage, getMessageById, chatHasBranches, incrementAgentUsage, getMessages, getActiveMcpServersForChat, getAgentById, getSkillById, incrementSkillUsage } from "@/lib/db/queries";
import { buildContextMessages, formatDynamicContext } from "@/lib/ai/context-builder";
import { countMessagesTokens, countTokens, estimateCost, calculateCacheSavings } from "@/lib/utils/token-counter";
import { calculateContextBudget, truncateHistoryToFit, estimateMessagesTokens, validateSystemContextFits, compactAndTruncateHistory, type LLMMessage, type CompactionConfig, type CompactionResult, type CompactedMessage } from "@/lib/utils/context-budget";
import type { MessageContent, Agent, Skill, Message, PipelineStep } from "@/lib/db/schema";
import { getImagesFromMessageContent, getTextFromMessageContent, mapTextInMessageContent, convertToAISDKContent } from "@/lib/utils/message-content";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { toast } from "sonner";
import { getActionableError, getErrorMessage, type APIErrorResponse } from "@/lib/utils/error-messages";
import { isModelIdCompatibleWithProviderId, pickBestProviderId, providerLabel } from "@/lib/ai/provider-routing";
import { addMemory, refreshCacheInBackground, searchMemories, runMemoryDecay } from "@/lib/memory";
import { generateAndApplySummary } from "@/lib/ai/summarization";
import { getSettings } from "@/lib/db/queries";
import { matchSkillWithEmbedding, SKILL_SWITCH_THRESHOLD } from "@/lib/skills/skill-matcher";
import type { UIMessage } from "ai";

function cleanReferencesForLLM(content: string) {
  return content
    .replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]")
    .replace(/#chat:[^\[]+\[([^\]]+)\]/g, "[$1]")
    // Remove agent mentions entirely (they're used to select the agent, not as content)
    .replace(/@agent:[^\[]+\[[^\]]+\]\s*/g, "")
    .trim();
}

/**
 * Ensure Composio session is valid before fetching MCP servers.
 * This lazily creates a new session when toolkits change or session expires.
 */
async function ensureComposioSession(activeMcpServerIds?: string[]): Promise<void> {
  // Only proceed if composio-consolidated is in the active servers
  if (!activeMcpServerIds?.includes("composio-consolidated")) {
    return;
  }

  // Get Composio API key
  const composioKey = useApiKeysStore.getState().getKeyForProvider("composio");
  if (!composioKey?.key) {
    console.warn("[Composio] No API key configured, skipping session creation");
    return;
  }

  // Check if session is valid
  const composioStore = useComposioStore.getState();
  const hasValidSession = selectHasValidSession(composioStore);

  if (hasValidSession) {
    return; // Session is valid, no need to create a new one
  }

  // Check if there are enabled toolkits
  if (composioStore.enabledToolkitKeys.length === 0) {
    console.warn("[Composio] No toolkits enabled, skipping session creation");
    return;
  }

  console.log("[Composio] Session expired or missing, creating new session...");

  // Create a new session
  const result = await composioStore.createSession(composioKey.key);
  if (result) {
    console.log("[Composio] Session created successfully");
  } else {
    console.warn("[Composio] Failed to create session");
  }
}

/**
 * Extract structured error info from stream error events.
 * Returns both the message and optional error code/provider for actionable feedback.
 */
function extractStreamError(parsed: { error?: unknown }): {
  message: string;
  errorCode?: string;
  provider?: string;
  retryAfter?: number;
} {
  const err = parsed.error as Record<string, unknown> | string | undefined;
  if (!err) return { message: "Unknown error occurred" };

  // Handle structured API error format from server
  if (typeof err === 'object') {
    // Check for our structured error format: { message, errorCode, provider, retryAfter }
    if (err.errorCode) {
      return {
        message: (err.message as string) || "An error occurred",
        errorCode: err.errorCode as string,
        provider: err.provider as string | undefined,
        retryAfter: err.retryAfter as number | undefined,
      };
    }

    // Legacy/fallback: extract message from various formats
    if (typeof err.message === 'string' && err.message) {
      return { message: err.message };
    }

    // Nested message paths (AI SDK variants)
    const data = err.data as Record<string, unknown> | undefined;
    if (data?.error && typeof data.error === 'object') {
      const nestedErr = data.error as Record<string, unknown>;
      if (typeof nestedErr.message === 'string') {
        return { message: nestedErr.message };
      }
    }
    const innerErr = err.error as Record<string, unknown> | undefined;
    if (innerErr && typeof innerErr.message === 'string') {
      return { message: innerErr.message };
    }

    // HTTP-style with status code
    if (err.status && err.statusText) {
      return { message: `HTTP ${err.status}: ${err.statusText}` };
    }
    if (err.status) {
      return { message: `Request failed with status ${err.status}` };
    }
  }

  // String error
  if (typeof err === 'string' && err) {
    return { message: err };
  }

  // Safe fallback - no raw JSON stringify
  return { message: "Stream error occurred - check browser console for details" };
}

// Legacy wrapper for backwards compatibility
function extractErrorMessage(parsed: { error?: unknown }): string {
  return extractStreamError(parsed).message;
}

/**
 * Generate an optimized image prompt using a text model.
 * This applies the agent's system prompt to create a professional image generation prompt.
 */
async function generateOptimizedImagePrompt(
  userPrompt: string,
  systemPrompt: string,
  apiKey: { key: string; baseUrl?: string } | undefined,
  signal?: AbortSignal
): Promise<string> {
  try {
    const response = await fetch("/api/chat/prompt-optimizer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey?.key ? { "X-API-Key": apiKey.key } : {}),
      },
      body: JSON.stringify({
        userPrompt,
        systemPrompt,
        providerBaseUrl: apiKey?.baseUrl,
      }),
      signal,
    });

    if (!response.ok) {
      console.warn("[Image Gen] Prompt optimization failed, using original prompt");
      return userPrompt;
    }

    const data = await response.json();
    return data.optimizedPrompt || userPrompt;
  } catch (error) {
    console.warn("[Image Gen] Prompt optimization error:", error);
    return userPrompt;
  }
}

/**
 * Handle image generation models separately from chat models.
 * Calls /api/images and creates a message with the generated image.
 * Supports image-to-image transformations when inputImages are provided.
 */
async function handleImageGeneration(
  chatId: string,
  modelId: string,
  providerId: string,
  apiKey: { key: string; baseUrl?: string } | undefined,
  prompt: string,
  inputImages?: string[], // Input images for image-to-image transformations
  parentUserMessageId?: string,
  signal?: AbortSignal,
  agentSystemPrompt?: string,
  onProgress?: (stage: ImageGenerationStage, messageId: string) => void
): Promise<void> {
  const { addMessage, updateMessage, updateChat, getChatById } = await import("@/lib/db/queries");

  // Create assistant message placeholder
  const assistantMessage = await addMessage({
    chatId,
    role: "assistant",
    content: [{ type: "text", text: "" }], // Empty - UI will show progress indicator
    modelId,
    parentId: parentUserMessageId,
  });

  // Update activeBranchLeafId immediately so the UI shows the new message
  // and branch state is consistent even if generation fails
  await updateChat(chatId, { activeBranchLeafId: assistantMessage.id });

  // Signal validating stage
  onProgress?.("validating", assistantMessage.id);

  try {
    // If there's an agent system prompt, optimize the image prompt first
    let finalPrompt = prompt;
    if (agentSystemPrompt) {
      onProgress?.("optimizing", assistantMessage.id);
      finalPrompt = await generateOptimizedImagePrompt(prompt, agentSystemPrompt, apiKey, signal);
    }

    // Signal generating stage
    onProgress?.("generating", assistantMessage.id);

    const response = await fetch("/api/images", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey?.key ? { "X-API-Key": apiKey.key } : {}),
      },
      body: JSON.stringify({
        providerId,
        providerBaseUrl: apiKey?.baseUrl,
        modelId,
        prompt: finalPrompt,
        inputImages: inputImages?.length ? inputImages : undefined, // Pass input images for image-to-image
        size: "1024x1024",
        quality: "standard",
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorObj = errorData as any;
      // Build detailed error message with suggestion if available
      let errorMessage = errorObj?.error || response.statusText;
      if (errorObj?.suggestion) {
        errorMessage += `\n\n💡 ${errorObj.suggestion}`;
      }
      throw new Error(errorMessage);
    }

    // Signal processing stage
    onProgress?.("processing", assistantMessage.id);

    const data = await response.json();
    const images = (data as any).images || [];

    if (images.length === 0) {
      // Extract helpful error info if available
      const errorInfo = data as any;
      const errorMsg = errorInfo.error || "No images generated";
      const suggestion = errorInfo.suggestion;
      throw new Error(suggestion ? `${errorMsg}\n\n💡 ${suggestion}` : errorMsg);
    }

    // Build content with generated images
    const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

    // Add revised prompt if available
    if (images[0].revisedPrompt) {
      contentParts.push({ type: "text", text: `*${images[0].revisedPrompt}*` });
    }

    // Add all generated images
    for (const img of images) {
      if (img.url) {
        contentParts.push({
          type: "image_url",
          image_url: { url: img.url },
        });
      }
    }

    // Update the assistant message with the generated images
    await updateMessage(assistantMessage.id, {
      content: contentParts,
    });
  } catch (error) {
    // Handle abort gracefully
    if (error instanceof Error && error.name === "AbortError") {
      await updateMessage(assistantMessage.id, {
        content: "⏹️ Image generation cancelled",
      });
      return;
    }
    // Update message with formatted error
    const errorText = error instanceof Error ? error.message : "Image generation failed";
    // Format error with proper line breaks for readability
    const formattedError = errorText.includes('\n\n💡')
      ? `**Image Generation Failed**\n\n${errorText}`
      : `**Image Generation Failed**\n\n${errorText}`;
    await updateMessage(assistantMessage.id, {
      content: formattedError,
    });
    throw error;
  }
}

/**
 * Handle pipeline agent execution.
 * Calls /api/agents/pipeline and streams step-by-step progress.
 */
async function handlePipelineExecution(
  chatId: string,
  agent: Agent,
  apiKey: { key: string; baseUrl?: string } | undefined,
  userInput: string,
  userImages?: string[],  // Base64 or URL images from the user message
  parentUserMessageId?: string,
  signal?: AbortSignal,
  pipelineActions?: {
    startPipeline: (steps: Array<{ id: string; name: string; type: "llm" | "image" | "tool" | "subagent" }>) => void;
    setStepRunning: (stepIndex: number, input?: string) => void;
    setStepComplete: (stepIndex: number, output: any, toolCalls?: Array<{ toolName: string; args: any; result?: any }>) => void;
    setStepError: (stepIndex: number, error: string) => void;
    setStepRetrying: (stepIndex: number, retryCount: number, maxRetries: number, error: string) => void;
    completePipeline: (finalResult: any) => void;
    failPipeline: (error: string) => void;
    clearPipeline: () => void;
  },
  mcpServers?: Array<{ id: string; name: string; url: string; apiKey?: string; enabled: boolean; type: "sse" | "stdio" | "http"; collection: "curated" | "custom"; toolPolicy?: { disabledTools?: string[] }; toolCaps?: number }>
): Promise<void> {
  const { addMessage, updateMessage, updateChat } = await import("@/lib/db/queries");
  type PipelineExecutionStep = import("@/lib/db/schema").PipelineExecutionStep;

  if (!agent.pipeline?.steps?.length) {
    throw new Error("Agent has no pipeline steps configured");
  }

  // Create assistant message placeholder
  const assistantMessage = await addMessage({
    chatId,
    role: "assistant",
    content: [{ type: "text", text: `🔄 Starting ${agent.name}...` }],
    modelId: agent.modelId || "pipeline",
    parentId: parentUserMessageId,
  });

  // Update activeBranchLeafId immediately
  await updateChat(chatId, { activeBranchLeafId: assistantMessage.id });

  // Track pipeline execution steps for persistence
  const executionSteps: PipelineExecutionStep[] = agent.pipeline.steps.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
  }));

  // Start pipeline tracking in the store
  if (pipelineActions) {
    pipelineActions.startPipeline(
      agent.pipeline.steps.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
      }))
    );
  }

  try {
    // Fetch memory context if any step needs it
    let memoryContext: string | undefined;
    const needsMemory = agent.pipeline.steps.some(s => s.memoryEnabled !== false);
    if (needsMemory) {
      const settings = await getSettings();
      if (settings?.memoryEnabled) {
        const memories = await searchMemories(userInput);
        if (memories?.length > 0) {
          memoryContext = memories.map(m => `- ${m.memory}`).join("\n");
        }
      }
    }

    // Fetch chat history if any step needs it
    let chatHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> | undefined;
    const needsHistory = agent.pipeline.steps.some(s => s.includeHistory);
    if (needsHistory && parentUserMessageId) {
      const history = await getMessagesForBranch(chatId, parentUserMessageId);
      chatHistory = history
        .filter((m: Message) => ["system", "user", "assistant"].includes(m.role))
        .slice(-20) // Limit history
        .map((m: Message) => ({
          role: m.role as "system" | "user" | "assistant",
          content: typeof m.content === "string" ? m.content : getTextFromMessageContent(m.content),
        }));
    }

    // Get Composio API key and enabled toolkits from stores if any step uses Composio
    const hasComposioServer = mcpServers?.some(s => s.id === "composio-consolidated");
    let composioApiKey: string | undefined;
    let composioGlobalToolkits: string[] | undefined;
    if (hasComposioServer && typeof window !== "undefined") {
      try {
        // Get Composio API key from encrypted store
        const composioKey = useApiKeysStore.getState().getKeyForProvider("composio");
        composioApiKey = composioKey?.key;
        // Get enabled toolkits from Composio store (single source of truth)
        const composioStore = useComposioStore.getState();
        composioGlobalToolkits = composioStore.enabledToolkitKeys;
      } catch {
        // Ignore errors
      }
    }

    const response = await fetch("/api/agents/pipeline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey?.key ? { "X-API-Key": apiKey.key } : {}),
        ...(composioApiKey ? { "X-Composio-Key": composioApiKey } : {}),
      },
      body: JSON.stringify({
        pipeline: agent.pipeline,
        userInput,
        userImages: userImages || [],  // Pass images for vision models
        chatId,
        providerBaseUrl: apiKey?.baseUrl,
        mcpServers,
        agentSystemPrompt: agent.systemPrompt,  // Include agent-level system prompt
        memoryContext,
        chatHistory,
        agentToolPolicy: agent.mcpToolPolicy,  // Agent-level tool restrictions
        agentEnabledTools: agent.enabledTools,  // Agent-level enabled tools
        composioGlobalToolkits,  // For step-specific session creation
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as any)?.error || response.statusText);
    }

    // Process SSE stream
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    let buffer = "";
    let finalResult: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case "step-start":
              // Record input for this step
              if (executionSteps[event.stepIndex]) {
                executionSteps[event.stepIndex].input = event.input;
              }
              if (pipelineActions) {
                pipelineActions.setStepRunning(event.stepIndex, event.input);
              }
              await updateMessage(assistantMessage.id, {
                content: [{ type: "text", text: `🔄 ${event.step.name}...` }],
              });
              break;

            case "step-complete":
              // Record output and tool calls for this step
              if (executionSteps[event.stepIndex]) {
                executionSteps[event.stepIndex].output = event.output;
                if (event.toolCalls && event.toolCalls.length > 0) {
                  executionSteps[event.stepIndex].toolCalls = event.toolCalls;
                }
              }
              if (pipelineActions) {
                pipelineActions.setStepComplete(event.stepIndex, event.output, event.toolCalls);
              }
              break;

            case "step-error":
              if (pipelineActions) {
                pipelineActions.setStepError(event.stepIndex, event.error);
              }
              // Only throw if it's a fatal error that can't be recovered
              // For tool errors, we let the pipeline continue if possible
              if (!event.continuing && !event.recoverable) {
                throw new Error(event.error);
              }
              // Log the error but continue - the pipeline may recover
              console.warn(`[Pipeline] Step ${event.stepIndex} error (continuing):`, event.error);
              break;

            case "step-retry":
              // Update UI to show retry attempt
              if (pipelineActions) {
                pipelineActions.setStepRetrying(
                  event.stepIndex,
                  event.retryCount,
                  event.maxRetries || 3,
                  event.error || "Unknown error"
                );
              }
              break;

            case "pipeline-complete":
              finalResult = event.result;
              if (pipelineActions) {
                pipelineActions.completePipeline(finalResult);
              }
              break;

            case "pipeline-error":
              if (pipelineActions) {
                pipelineActions.failPipeline(event.error);
              }
              throw new Error(event.error);

            case "done":
              // Stream complete
              break;
          }
        } catch (e) {
          // Only re-throw fatal errors, not parse errors
          if (e instanceof Error &&
              e.message !== "Failed to parse stream data" &&
              !e.message.includes("Unexpected token") &&
              !e.message.includes("JSON")) {
            throw e;
          }
          console.warn("Failed to parse pipeline stream data:", data, e);
        }
      }
    }

    // Build final message content and persist pipeline execution
    if (finalResult) {
      // Check if the result is an image object
      if (typeof finalResult === "object" && finalResult.type === "image" && finalResult.url) {
        const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
        if (finalResult.revisedPrompt) {
          contentParts.push({ type: "text", text: `*${finalResult.revisedPrompt}*` });
        }
        contentParts.push({
          type: "image_url",
          image_url: { url: finalResult.url },
        });
        await updateMessage(assistantMessage.id, {
          content: contentParts,
          pipelineExecution: {
            steps: executionSteps,
            agentName: agent.name,
          },
        });
      } else {
        // Text result
        await updateMessage(assistantMessage.id, {
          content: typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult),
          pipelineExecution: {
            steps: executionSteps,
            agentName: agent.name,
          },
        });
      }
    }
  } catch (error) {
    // Handle abort gracefully
    if (error instanceof Error && error.name === "AbortError") {
      await updateMessage(assistantMessage.id, {
        content: "⏹️ Pipeline cancelled",
      });
      if (pipelineActions) {
        pipelineActions.clearPipeline();
      }
      return;
    }

    const errorText = error instanceof Error ? error.message : "Pipeline failed";
    await updateMessage(assistantMessage.id, {
      content: `❌ ${errorText}`,
    });
    if (pipelineActions) {
      pipelineActions.failPipeline(errorText);
    }
    throw error;
  }
}

export function useChat(chatId: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const { keys, getKeyForProvider, isProviderKeyLocked, requestVaultUnlock } = useApiKeysStore();

  const { isMultiModelMode, multiModelPanels } = useUIStore();
  const {
    setStreamingMessage,
    appendStreamingContent,
    appendStreamingReasoning,
    setStreamingToolCalls,
    setStreamingToolResults,
    upsertStreamingApproval,
    removeStreamingApproval,
    clearStreaming,
    startPipeline,
    setStepRunning,
    setStepComplete,
    setStepError,
    setStepRetrying,
    completePipeline,
    failPipeline,
    clearPipeline,
    setOptimisticMessage,
    clearOptimisticMessage,
    setActiveSkill,
    clearActiveSkill,
    setPendingSkillApproval,
    setImageGenerationProgress,
    clearImageGenerationProgress,
    getChatStream,
    setContextCompaction,
    setCodingAgentStarted,
    appendCodingAgentOutput,
    setCodingAgentCompleted,
    addCodingAgentEvent,
  } = useStreamingStore();

  // Sync loading state with streaming store when chatId changes
  // This prevents blocking input when switching to a non-streaming chat
  useEffect(() => {
    if (!chatId) {
      setIsLoading(false);
      setError(null);
      setContinuingMessageId(null);
      return;
    }
    const chatStream = getChatStream(chatId);
    const isCurrentlyStreaming = chatStream.streamingMessageId !== null;
    setIsLoading(isCurrentlyStreaming);
    setError(null);
    setContinuingMessageId(null);
  }, [chatId, getChatStream]);

  const extractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dbUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pipelineClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to hold the latest sendMessage function for use in callbacks
  const sendMessageRef = useRef<((content: MessageContent, attachments?: Array<{ name: string; content: string }>, selectedSkill?: Skill | null) => Promise<void>) | null>(null);

  // Schedule memory extraction after assistant response (debounced)
  const scheduleMemoryExtraction = useCallback(async () => {
    // Clear any pending extraction
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current);
    }

    // Capture chatId at schedule time to prevent stale closure when user switches chats
    const capturedChatId = chatId;

    // Debounce: wait 20 seconds after last assistant response
    extractionTimeoutRef.current = setTimeout(async () => {
      try {
        if (!capturedChatId) return; // Can't extract without a chat ID

        // Check if chat is in incognito mode - skip extraction if so
        const chat = await getChatById(capturedChatId);
        if (chat?.incognitoMode) return;

        const settings = await getSettings();
        const memoryEnabled = settings?.memoryEnabled ?? true; // Default to true
        const autoExtract = settings?.memoryAutoExtract ?? true; // Default to true
        if (!memoryEnabled || !autoExtract) return;

        const messages = await getMessages(capturedChatId);
        if (messages.length >= 2) {
          // Get last exchange (User + Assistant) for context
          const recentMessages = messages.slice(-2).map((m: Message) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : getTextFromMessageContent(m.content)
          }));
          await addMemory(recentMessages);
        }
      } catch (err) {
        console.error("[Chat] Failed to extract memories:", err);
      }
    }, 20000); // 20 second debounce
  }, [chatId]);

  // Flush pending extraction on page hide
  useEffect(() => {
    const handlePageHide = () => {
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current);
        // Flush immediately (unless incognito)
        if (!chatId) return;
        getChatById(chatId).then(async (chat) => {
          if (chat?.incognitoMode) return; // Skip extraction in incognito mode
          const messages = await getMessages(chatId);
          const settings = await getSettings();
          const autoExtract = settings?.memoryAutoExtract ?? true;
          if (settings?.memoryEnabled && autoExtract && messages.length >= 2) {
            const recentMessages = messages.slice(-2).map((m: Message) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : getTextFromMessageContent(m.content)
            }));
            addMemory(recentMessages).catch(console.error);
          }
        }).catch(console.error);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handlePageHide();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Clean up all pending timeouts when chat changes or component unmounts
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current);
        extractionTimeoutRef.current = null;
      }
      if (dbUpdateTimeoutRef.current) {
        clearTimeout(dbUpdateTimeoutRef.current);
        dbUpdateTimeoutRef.current = null;
      }
      if (streamingClearTimeoutRef.current) {
        clearTimeout(streamingClearTimeoutRef.current);
        streamingClearTimeoutRef.current = null;
      }
      if (pipelineClearTimeoutRef.current) {
        clearTimeout(pipelineClearTimeoutRef.current);
        pipelineClearTimeoutRef.current = null;
      }
      // NOTE: Do NOT clear streaming state when switching chats
      // This allows requests to complete in the background
      // The streaming state will be cleared naturally when the response completes
      // and the data will be persisted to the DB for when user returns
    };
  }, [chatId]);

  const generateResponse = useCallback(async (
    messageContent: MessageContent,
    attachments?: Array<{ name: string; content: string }>,
    overrideModelId?: string,
    parentUserMessageId?: string,
    activeSkill?: Skill | null,
    chatIdOverride?: string,
    queryEmbedding?: number[]
  ) => {
    // Extract user message text for later use (e.g., background memory refresh)
    const userMessageText = getTextFromMessageContent(messageContent);

    // Use override if provided (for draft mode), otherwise use closure chatId
    const effectiveChatId = chatIdOverride || chatId;
    if (!effectiveChatId) {
      throw new Error("No chat ID available");
    }

    // Get chat details for model info
    const chat = await getChatById(effectiveChatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    // Get agent for system prompt and other settings
    // Use chat.modelId for the model - agent's default is copied there when selected,
    // and user changes via dropdown update chat.modelId
    const agent = chat.agentId ? await getAgentById(chat.agentId) : undefined;
    const executionTarget = chat.executionTarget ?? "lumina";
    const modelId = overrideModelId || chat.modelId;

    // Route to Lumina CLI runtime only when explicitly selected.
    if (executionTarget === "lumina_cli") {
      const { useLuminaStore } = await import("@/stores/lumina-store");
      const luminaStore = useLuminaStore.getState();

      if (!luminaStore.isConnected) {
        const errMsg = await addMessage({
          chatId: effectiveChatId,
          role: "assistant",
          content: "Lumina Runtime is not connected. Go to Settings > Lumina to configure the connection.",
          parentId: parentUserMessageId,
        });
        await updateChat(effectiveChatId, { activeBranchLeafId: errMsg.id });
        return;
      }

      // Ensure keys are synced before streaming (mirrors chatWithLumina guard)
      if (!luminaStore.keysSynced) {
        await useLuminaStore.getState().syncKeys();
      }

      const cleanedMessage = cleanReferencesForLLM(getTextFromMessageContent(messageContent));

      // Load conversation history for Lumina context
      let luminaHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
      try {
        const history = parentUserMessageId
          ? await getMessagesForBranch(effectiveChatId, parentUserMessageId)
          : await getMessages(effectiveChatId);
        luminaHistory = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-20)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: getTextFromMessageContent(m.content),
          }))
          .filter((m) => m.content.trim());
      } catch (e) {
        console.warn("[Lumina] Failed to load conversation history:", e);
      }

      // Create placeholder message to show loading skeleton
      const placeholderMsg = await addMessage({
        chatId: effectiveChatId,
        role: "assistant",
        content: "",
        parentId: parentUserMessageId,
      });
      await updateChat(effectiveChatId, { activeBranchLeafId: placeholderMsg.id });
      setStreamingMessage(effectiveChatId, placeholderMsg.id);
      const finalizeLuminaStreaming = () => {
        if (streamingClearTimeoutRef.current) {
          clearTimeout(streamingClearTimeoutRef.current);
        }
        streamingClearTimeoutRef.current = setTimeout(() => {
          clearStreaming(effectiveChatId);
          streamingClearTimeoutRef.current = null;
          void processNextInQueue(effectiveChatId);
        }, 150);
      };

      const streamToolCalls: any[] = [];
      const streamToolResults: any[] = [];
      try {
        const client = luminaStore.client;
        if (!client) {
          throw new Error("Lumina client not available");
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        let fullContent = "";
        let luminaTaskId = "";

        for await (const event of client.chatStream(cleanedMessage, luminaHistory, controller.signal)) {
          switch (event.type) {
            case "text-delta":
              fullContent += event.text;
              appendStreamingContent(effectiveChatId, event.text);
              break;
            case "tool-call":
              streamToolCalls.push({
                id: event.toolCallId,
                toolCallId: event.toolCallId,
                taskId: event.taskId,
                toolName: event.toolName,
                toolLabel: event.toolLabel,
                args: event.args,
                startTime: Date.now(),
              });
              setStreamingToolCalls(effectiveChatId, [...streamToolCalls]);
              await updateMessage(placeholderMsg.id, { toolCalls: [...streamToolCalls] });
              break;
            case "tool-result":
              streamToolResults.push({
                id: event.toolCallId,
                toolCallId: event.toolCallId,
                taskId: event.taskId,
                toolName: event.toolName,
                summary: event.summary,
                result: event.summary,
                endTime: Date.now(),
              });
              setStreamingToolResults(effectiveChatId, [...streamToolResults]);
              await updateMessage(placeholderMsg.id, { toolResults: [...streamToolResults] });
              break;
            case "approval-requested":
              upsertStreamingApproval(effectiveChatId, {
                id: event.id,
                toolName: event.toolName,
                args: event.args || {},
                source: event.source,
                taskId: event.taskId,
                reason: event.reason,
                createdAt: event.createdAt || Date.now(),
                timeoutMs: event.timeoutMs,
              });
              break;
            case "approval-responded":
            case "approval-timeout":
              removeStreamingApproval(effectiveChatId, event.id);
              break;
            case "coding-agent-started":
              setCodingAgentStarted(effectiveChatId, { provider: event.provider, prompt: event.prompt, cwd: event.cwd });
              break;
            case "coding-agent-output":
              appendCodingAgentOutput(effectiveChatId, event.chunk);
              break;
            case "coding-agent-completed":
              setCodingAgentCompleted(effectiveChatId, event.exitCode);
              break;
            case "coding-agent-event":
              addCodingAgentEvent(effectiveChatId, event.event);
              break;
            case "artifact-created":
              addCodingAgentEvent(effectiveChatId, {
                type: "file_change",
                path: event.path,
                action: "created",
                language: event.language,
              });
              break;
            case "reasoning":
              appendStreamingReasoning(effectiveChatId, event.text);
              break;
            case "completed":
              luminaTaskId = event.taskId;
              if (!fullContent && event.response) {
                fullContent = event.response;
              }
              break;
            case "error":
              throw new Error(event.error || "Unknown Lumina stream error");
            case "done":
              break;
          }
        }

        const finalContent = fullContent
          ? (luminaTaskId ? `${fullContent}\n\n*Task ID: ${luminaTaskId}*` : fullContent)
          : "Lumina Runtime returned an empty response. This usually means a configuration issue — check Settings > Lumina.";
        // Snapshot coding agent state before clearStreaming wipes it
        const successStreamState = useStreamingStore.getState().getChatStream(effectiveChatId);
        const successCodingAgent = successStreamState?.codingAgent;
        const successCodingEvents = successStreamState?.codingAgentEvents;
        await updateMessage(placeholderMsg.id, {
          content: finalContent,
          toolCalls: streamToolCalls.length > 0 ? streamToolCalls : undefined,
          toolResults: streamToolResults.length > 0 ? streamToolResults : undefined,
          codingAgent: successCodingAgent ? { provider: successCodingAgent.provider, prompt: successCodingAgent.prompt, cwd: successCodingAgent.cwd, status: successCodingAgent.status, exitCode: successCodingAgent.exitCode } : undefined,
          codingAgentEvents: successCodingEvents?.length ? successCodingEvents : undefined,
        });
        abortControllerRef.current = null;
        finalizeLuminaStreaming();
        return;
      } catch (e) {
        const partialContent = useStreamingStore.getState().getChatStream(effectiveChatId)?.streamingContent || "";
        const errorMsg = (e as Error).message;
        const content = partialContent
          ? `${partialContent}\n\n---\n*Stream interrupted: ${errorMsg}*`
          : `Lumina Runtime error: ${errorMsg}`;
        // Mark any in-flight tool calls as errored so they don't stay stuck in "running" state
        const errorToolResults = streamToolCalls
          .filter(tc => !streamToolResults.some(tr => (tr.id || tr.toolCallId) === (tc.id || tc.toolCallId)))
          .map(tc => ({
            id: tc.id || tc.toolCallId,
            toolCallId: tc.id || tc.toolCallId,
            taskId: tc.taskId,
            toolName: tc.toolName,
            result: { isError: true, error: errorMsg },
            summary: `Error: ${errorMsg}`,
            endTime: Date.now(),
          }));
        const allToolResults = [...streamToolResults, ...errorToolResults];
        // Snapshot coding agent state before clearStreaming wipes it
        const errorStreamState = useStreamingStore.getState().getChatStream(effectiveChatId);
        const errorCodingAgent = errorStreamState?.codingAgent;
        const errorCodingEvents = errorStreamState?.codingAgentEvents;
        await updateMessage(placeholderMsg.id, {
          content,
          toolResults: allToolResults.length > 0 ? allToolResults : undefined,
          codingAgent: errorCodingAgent ? { provider: errorCodingAgent.provider, prompt: errorCodingAgent.prompt, cwd: errorCodingAgent.cwd, status: errorCodingAgent.status, exitCode: errorCodingAgent.exitCode } : undefined,
          codingAgentEvents: errorCodingEvents?.length ? errorCodingEvents : undefined,
        });
        abortControllerRef.current = null;
        finalizeLuminaStreaming();
        return;
      }
    }

    const llmProviderIds = Array.from(
      new Set(
        keys
          .map((k) => k.provider)
          .filter((p) =>
            ["openrouter", "openai", "anthropic", "google", "groq", "together", "deepseek", "mistral", "xai", "perplexity", "anyscale"].includes(p) ||
            p.startsWith("custom-openai:")
          )
      )
    );

    const providerId =
      (chat.providerId &&
        llmProviderIds.includes(chat.providerId) &&
        isModelIdCompatibleWithProviderId(chat.providerId, modelId)
        ? chat.providerId
        : null) ||
      pickBestProviderId({
        modelId,
        availableProviderIds: llmProviderIds,
      });

    if (!providerId) {
      throw new Error(
        "No compatible provider configured for this model. Add an API key for OpenRouter or the model's provider in Settings."
      );
    }

    const apiKey = getKeyForProvider(providerId);
    if (!apiKey?.key) {
      if (isProviderKeyLocked(providerId)) {
        requestVaultUnlock(providerId);
        throw new Error("Vault is locked. Unlock it to continue.");
      }
      throw new Error(`Missing API key for ${providerLabel(providerId)}.`);
    }

    const enabledTools = chat.enabledTools || [];
    const images = getImagesFromMessageContent(messageContent);
    const modelCaps = getModelCapabilities(modelId);

    if (images.length > 0 && !modelCaps.supportsVision) {
      throw new Error(
        `${modelId} doesn't support image attachments. ` +
        `Switch to a vision model (e.g., Gemini 3 Flash, Claude Sonnet 4.5, GPT-5) or remove images to send.`
      );
    }

    // Check if this is a pipeline agent
    if (agent?.executionType === "pipeline" && agent.pipeline?.steps?.length) {
      abortControllerRef.current = new AbortController();
      try {
        // Get MCP servers for tool steps - include servers from all pipeline step configurations
        // Steps can have their own mcpServerIds that need to be fetched
        const allStepMcpServerIds = agent.pipeline.steps.flatMap((step: PipelineStep) => step.mcpServerIds || []);
        const uniqueMcpServerIds = [...new Set([
          ...(chat.activeMcpServerIds || []),
          ...(agent.mcpServerIds || []),
          ...allStepMcpServerIds
        ])];
        // Ensure Composio session is valid before fetching MCP servers
        await ensureComposioSession(uniqueMcpServerIds);
        const mcpServers = await getActiveMcpServersForChat(uniqueMcpServerIds);

        // Extract images from message content for vision-enabled pipeline steps
        const userImages = getImagesFromMessageContent(messageContent);

        await handlePipelineExecution(
          effectiveChatId,
          agent,
          apiKey,
          cleanReferencesForLLM(getTextFromMessageContent(messageContent)),
          userImages,  // Pass images for vision models in pipeline
          parentUserMessageId,
          abortControllerRef.current.signal,
          {
            startPipeline: (steps) => startPipeline(effectiveChatId, steps),
            setStepRunning: (stepIndex, input) => setStepRunning(effectiveChatId, stepIndex, input),
            setStepComplete: (stepIndex, output, toolCalls) => setStepComplete(effectiveChatId, stepIndex, output, toolCalls),
            setStepError: (stepIndex, error) => setStepError(effectiveChatId, stepIndex, error),
            setStepRetrying: (stepIndex, retryCount, maxRetries, error) => setStepRetrying(effectiveChatId, stepIndex, retryCount, maxRetries, error),
            completePipeline: (finalResult) => completePipeline(effectiveChatId, finalResult),
            failPipeline: (error) => failPipeline(effectiveChatId, error),
            clearPipeline: () => clearPipeline(effectiveChatId),
          },
          mcpServers
        );
        // Pipeline completed successfully - clear after delay for UI to catch up
        if (pipelineClearTimeoutRef.current) {
          clearTimeout(pipelineClearTimeoutRef.current);
        }
        pipelineClearTimeoutRef.current = setTimeout(() => {
          clearPipeline(effectiveChatId);
          pipelineClearTimeoutRef.current = null;
        }, 1000);
        return;
      } catch (error) {
        // Clear pipeline state immediately on error
        clearPipeline(effectiveChatId);
        throw error;
      } finally {
        abortControllerRef.current = null;
      }
    }

    // Check if this is an image generation model
    if (modelCaps.isImageGeneration) {
      // Create abort controller for image generation
      abortControllerRef.current = new AbortController();
      try {
        // Extract any input images from the message (for image-to-image transformations)
        const userInputImages = getImagesFromMessageContent(messageContent);
        return await handleImageGeneration(
          effectiveChatId,
          modelId,
          providerId,
          apiKey,
          getTextFromMessageContent(messageContent),
          userInputImages.length > 0 ? userInputImages : undefined, // Pass user images for editing
          parentUserMessageId,
          abortControllerRef.current.signal,
          agent?.systemPrompt, // Pass agent's system prompt for prompt optimization
          (stage, messageId) => setImageGenerationProgress(effectiveChatId, messageId, stage)
        );
      } finally {
        abortControllerRef.current = null;
        clearImageGenerationProgress(effectiveChatId);
      }
    }

    // Set active skill in streaming store if provided (for UI indicator)
    if (activeSkill) {
      setActiveSkill(effectiveChatId, {
        id: activeSkill.id,
        name: activeSkill.name,
        icon: activeSkill.ui.icon,
        color: activeSkill.ui.color,
        activeLabel: activeSkill.ui.activeLabel,
      });
      // Increment skill usage
      incrementSkillUsage(activeSkill.id).catch(() => { });
    }

    // Add empty assistant message IMMEDIATELY to show loading state
    // This happens before any context building, memory, or embedding calls
    const assistantMessage = await addMessage({
      chatId: effectiveChatId,
      role: "assistant",
      content: "",
      modelId,
      isArena: !!overrideModelId,
      parentId: parentUserMessageId,
      skillId: activeSkill?.id,
    });

    // Update activeBranchLeafId immediately so the UI shows the new message
    await updateChat(effectiveChatId, { activeBranchLeafId: assistantMessage.id });

    // Set streaming message immediately - this shows the assistant loading state
    // BEFORE any memory, embedding, or context building calls
    setStreamingMessage(effectiveChatId, assistantMessage.id);

    // Build context with static/dynamic separation for prompt caching
    // Static messages (agent, project, skill prompts) can be cached across turns
    // Dynamic context (memory, RAG) is injected into the current user message
    const { staticMessages, dynamicContext } = await buildContextMessages(
      getTextFromMessageContent(messageContent),
      effectiveChatId,
      { memoryDisabled: chat.memoryDisabled, incognitoMode: chat.incognitoMode, skill: activeSkill, queryEmbedding }
    );

    // === Context Window Management ===
    // 1. Convert static system messages to LLM format and estimate tokens
    const systemMessages: LLMMessage[] = staticMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: convertToAISDKContent(m.content, m.role as "system" | "user" | "assistant"),
    }));
    const systemTokens = estimateMessagesTokens(systemMessages);

    // 2. Calculate attachment tokens
    const attachmentMessages: LLMMessage[] = (attachments || []).map((file) => ({
      role: "system" as const,
      content: `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\``,
    }));
    const attachmentTokens = estimateMessagesTokens(attachmentMessages);

    // 3. Validate system context fits within model limits
    const validation = validateSystemContextFits(modelId, systemTokens + attachmentTokens);
    if (!validation.fits) {
      toast.error("Context limit exceeded", {
        description: validation.message || "Your message is too long for this model.",
        action: {
          label: "Start New",
          onClick: () => window.dispatchEvent(new CustomEvent("lumina:new-chat")),
        },
      });
      return;
    }

    // 4. Calculate available budget for history
    const budget = calculateContextBudget(modelId, systemTokens, attachmentTokens);

    // 5. Get raw history from DB
    const rawHistory = await getMessagesForBranch(effectiveChatId, parentUserMessageId);
    const filteredHistory = rawHistory.filter(
      (m: Message) => m.role === "system" || m.role === "user" || m.role === "assistant"
    );

    // 6. Handle context compaction/truncation
    // Check if smart compaction is enabled (defaults to true)
    const smartCompactionEnabled = chat.smartCompaction !== false;
    const isIncognito = chat.incognitoMode === true;

    let truncatedHistory: LLMMessage[];
    let compactionState: ContextCompactionState | null = null;

    // Try intelligent compaction if enabled and we have enough messages
    if (smartCompactionEnabled && !isIncognito && filteredHistory.length > 10 && apiKey?.key) {
      const compactionConfig: CompactionConfig = {
        chatId: effectiveChatId,
        providerId,
        apiKey: apiKey.key,
        providerBaseUrl: apiKey?.baseUrl,
        isIncognitoMode: isIncognito,
        smartCompactionEnabled,
      };

      const result = await compactAndTruncateHistory(
        filteredHistory,
        budget.remainingForHistory,
        compactionConfig
      );

      // Transform the compacted history to LLM format
      // compactedHistory contains CompactedMessage with string content
      // We need to get original messages for proper image handling
      const keptMessageMap = new Map<string, Message>(
        filteredHistory
          .filter((m: Message) => result.keptMessageIds.includes(m.id))
          .map((m: Message) => [m.id, m] as [string, Message])
      );

      truncatedHistory = result.compactedHistory.map((cm: CompactedMessage) => {
        // Summary messages - use string content directly
        if (cm.isSummary) {
          return {
            role: cm.role,
            content: cm.content,
          } as LLMMessage;
        }

        // For kept messages, get the original and apply transformations
        const originalMsg = cm.originalId ? keptMessageMap.get(cm.originalId) : undefined;
        if (originalMsg) {
          const role = originalMsg.role as "system" | "user" | "assistant";
          const content = role === "user"
            ? mapTextInMessageContent(originalMsg.content, cleanReferencesForLLM)
            : originalMsg.content;
          return {
            role,
            content: convertToAISDKContent(content, role),
          } as LLMMessage;
        }

        // Fallback for messages not found in map (shouldn't happen)
        return {
          role: cm.role,
          content: cm.role === "user" ? cleanReferencesForLLM(cm.content) : cm.content,
        } as LLMMessage;
      });

      // Store compaction state for UI
      if (result.wasCompacted || result.wasTruncated) {
        compactionState = {
          wasCompacted: result.wasCompacted,
          wasTruncated: result.wasTruncated,
          messagesInFull: result.messagesInFull,
          messagesSummarized: result.messagesSummarized,
          messagesDropped: result.messagesDropped,
          tokensSaved: result.tokensSaved,
          summaryPreview: result.summaryInfo?.summary?.slice(0, 200),
        };
        setContextCompaction(effectiveChatId, compactionState);

        // Show simple notification
        if (result.wasCompacted && result.messagesSummarized > 0) {
          toast.success("Older messages summarized to make room");
        } else if (result.wasTruncated && result.messagesDropped > 0) {
          toast.warning("Older messages removed to make room");
        }
      }
    } else {
      // Use simple transformation and truncation
      const historyMessages: LLMMessage[] = filteredHistory.map((m: Message) => {
        const role = m.role as "system" | "user" | "assistant";
        const content = role === "user"
          ? mapTextInMessageContent(m.content, cleanReferencesForLLM)
          : m.content;
        return {
          role,
          content: convertToAISDKContent(content, role),
        };
      });

      const truncationResult = truncateHistoryToFit(
        historyMessages,
        budget.remainingForHistory
      );

      truncatedHistory = truncationResult.truncatedHistory;

      // Show warning toast if history was truncated
      if (truncationResult.wasLimited) {
        toast.warning(
          `Context limit: showing ${truncationResult.truncatedCount} of ${truncationResult.originalCount} messages`
        );
      }
    }

    // 8. Build final LLM messages with dynamic context in current user message
    //
    // IMPORTANT: Anthropic doesn't allow system messages after user/assistant.
    // So we inject memory/RAG into the CURRENT user message content.
    //
    // Message order:
    // 1. Static system messages (tools, agent prompt) - CACHEABLE if >= 1024 tokens
    // 2. Conversation history from DB (user/assistant) - raw, stable
    // 3. Current user message WITH memory/RAG prepended
    //
    // Cache strategy: ONLY cache at static system messages.
    // The prefix [static_system] is stable. Memory changes in user message
    // don't affect the cached prefix since we don't cache user messages.

    // Build dynamic context prefix for current user message
    // Uses formatDynamicContext which includes instructions to NOT echo memories back
    const contextPrefix = formatDynamicContext(dynamicContext);

    // Inject context into the LAST user message (current message being sent)
    let finalHistory = truncatedHistory;
    if (contextPrefix && truncatedHistory.length > 0) {
      const lastIdx = truncatedHistory.length - 1;
      const lastMsg = truncatedHistory[lastIdx];
      if (lastMsg.role === 'user') {
        const originalContent = typeof lastMsg.content === 'string'
          ? lastMsg.content
          : Array.isArray(lastMsg.content)
            ? lastMsg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join('')
            : '';
        finalHistory = [
          ...truncatedHistory.slice(0, lastIdx),
          { ...lastMsg, content: contextPrefix + originalContent },
        ];
      }
    }

    const llmMessages = [
      ...systemMessages,           // Static system (cacheable if >= 1024 tokens)
      ...attachmentMessages,       // File attachments
      ...finalHistory,             // History + current user message with context
    ];

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Track content for abort handling (needs to be outside try block for catch access)
    let fullContent = "";

    // Connection timeout - longer for mobile networks
    // Detect mobile using user agent (Android/iOS)
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const timeoutMs = isMobile ? 60000 : 30000; // 60s for mobile, 30s for desktop

    // Retry configuration
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1000;

    let response: Response | null = null;
    let retryCount = 0;
    let connectionTimeoutId: NodeJS.Timeout | null = null;

    // Retry loop for transient failures
    while (retryCount <= MAX_RETRIES) {
      try {
        // Set connection timeout
        connectionTimeoutId = setTimeout(() => {
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
        }, timeoutMs);

        // Call API route for streaming
        // In incognito mode, don't pass any tools
        // Ensure Composio session is valid before fetching MCP servers
        if (!chat.incognitoMode) {
          await ensureComposioSession(chat.activeMcpServerIds);
        }
        const mcpServersForRequest = chat.incognitoMode
          ? []
          : await getActiveMcpServersForChat(chat.activeMcpServerIds);
        const enabledToolsForRequest = chat.incognitoMode ? [] : enabledTools;

        response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey?.key ? { "X-API-Key": apiKey.key } : {}),
          },
          body: JSON.stringify({
            providerId,
            providerBaseUrl: apiKey?.baseUrl,
            modelId,
            messages: llmMessages,
            enabledTools: enabledToolsForRequest,
            mcpServers: mcpServersForRequest,
            reasoningLevel: chat.reasoningLevel, // Pass reasoning level to backend
          }),
          signal: abortControllerRef.current.signal,
        });

        // Clear connection timeout once response is received
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
        }

        // Check if response is retryable
        const status = response.status;
        if (!response.ok) {
          // Retry on server errors (5xx) or rate limits (429)
          if ((status >= 500 && status <= 504) || status === 429) {
            retryCount++;
            if (retryCount <= MAX_RETRIES) {
              console.log(`[Retry] Attempt ${retryCount}/${MAX_RETRIES} after ${status} error`);
              // Exponential backoff: 1s, 2s, 4s (not linear 1s, 2s, 3s)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, retryCount)));
              continue;
            }
          }

          // Non-retryable error or max retries exceeded
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = (errorData as any)?.error || (errorData as any)?.message || response.statusText;
          throw new Error(errorMessage);
        }

        // Success - break retry loop
        break;
      } catch (error) {
        // Clear timeout on error
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
        }

        // Check if error is retryable (abort, network errors, DNS failures)
        const isRetryableError = (err: unknown): boolean => {
          if (!(err instanceof Error)) return false;
          // Abort/timeout errors
          if (err.name === 'AbortError') return true;
          // Network errors
          const msg = err.message.toLowerCase();
          return (
            msg.includes('econnreset') ||
            msg.includes('etimedout') ||
            msg.includes('enotfound') ||
            msg.includes('fetch failed') ||
            msg.includes('network') ||
            msg.includes('socket hang up') ||
            msg.includes('connection refused')
          );
        };

        // Handle retryable errors (abort, network issues)
        if (isRetryableError(error)) {
          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            const errorType = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network error';
            console.log(`[Retry] Attempt ${retryCount}/${MAX_RETRIES} after ${errorType}`);
            // Create new abort controller for retry
            abortControllerRef.current = new AbortController();
            // Exponential backoff: 1s, 2s, 4s (not linear 1s, 2s, 3s)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, retryCount)));
            continue;
          }
        }

        // Re-throw non-retryable errors or max retries exceeded
        throw error;
      }
    }

    // Ensure we have a valid response
    if (!response) {
      throw new Error('Failed to get response after retries');
    }

    try {

      // Handle streaming response with real-time updates
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      fullContent = ""; // Reset content tracking
      let fullReasoning = ""; // For extended thinking / reasoning
      let inputTokens = 0; // Accumulated across all steps
      let outputTokens = 0; // Accumulated across all steps
      let cachedTokens = 0; // Accumulated cached tokens from prompt caching
      let thinkingTokens = 0; // Accumulated thinking/reasoning tokens
      let actualCost = 0; // Accumulated cost from provider (OpenRouter, etc.)
      let hasReceivedUsage = false; // Track if we received any usage data
      let costIsEstimated = false;
      const toolCalls: any[] = [];
      const toolResults: any[] = [];
      const toolTimings: Record<string, { start?: number; end?: number }> = {};

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            // Debug: Log all step-finish events (these contain providerMetadata)
            if (parsed.type === 'step-finish' || parsed.type === 'finish') {
              console.log(`[use-chat] ${parsed.type} event:`, JSON.stringify(parsed).slice(0, 1000));
            }

            const extractUsage = (value: any): { inTok?: number; outTok?: number; cachedTok?: number; thinkingTok?: number; cost?: number } => {
              if (!value || typeof value !== "object") return {};
              const usage = (value.usage && typeof value.usage === "object") ? value.usage : value;

              const toNum = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

              // OpenRouter returns cost in experimental_providerMetadata.openrouter
              const providerMeta = value.experimental_providerMetadata?.openrouter ||
                value.providerMetadata?.openrouter ||
                value.response?.providerMetadata?.openrouter ||
                {};

              // Extract cached tokens from various provider formats:
              // - OpenAI: usage.promptTokensDetails?.cachedTokens or usage.prompt_tokens_details?.cached_tokens
              // - Anthropic: providerMetadata.anthropic.usage.cache_read_input_tokens
              // - Google: providerMetadata.google.usageMetadata.cachedContentTokenCount
              // - OpenRouter: same as underlying provider
              const promptDetails = usage.promptTokensDetails ?? usage.prompt_tokens_details ?? {};
              const googleUsageMeta = value.providerMetadata?.google?.usageMetadata ?? {};
              // Anthropic metadata can be at various paths depending on AI SDK version
              const anthropicUsageMeta =
                value.providerMetadata?.anthropic?.usage ??
                value.response?.providerMetadata?.anthropic?.usage ??
                value.experimental_providerMetadata?.anthropic?.usage ??
                {};

              // Debug: Log when Anthropic cache data is found
              if (anthropicUsageMeta.cache_read_input_tokens) {
                console.log('[use-chat] Found Anthropic cache:', anthropicUsageMeta.cache_read_input_tokens);
              }
              // Debug: Log any providerMetadata to see what's being received
              if (value.providerMetadata || value.response?.providerMetadata || value.experimental_providerMetadata) {
                const meta = value.providerMetadata || value.response?.providerMetadata || value.experimental_providerMetadata;
                console.log('[use-chat] providerMetadata received:', JSON.stringify(meta).slice(0, 500));
              }
              // Debug: Log entire event if it contains 'cache' (helps find unexpected structures)
              const eventStr = JSON.stringify(value);
              if (eventStr.includes('cache_read') || eventStr.includes('cacheRead')) {
                console.log('[use-chat] Event with cache data:', eventStr.slice(0, 800));
              }

              // Also check inputTokenDetails (AI SDK v5 format)
              const inputTokenDetails = usage.inputTokenDetails ?? {};

              // Extract cache tokens from various provider formats:
              // - OpenAI: promptTokensDetails.cachedTokens
              // - Anthropic: providerMetadata.anthropic.usage.cache_read_input_tokens
              // - Google: providerMetadata.google.usageMetadata.cachedContentTokenCount
              // - DeepSeek: usage.prompt_cache_hit_tokens
              // - Groq: usage.cache_read_input_tokens
              // - xAI: providerMetadata.xai.cache_read_tokens
              const deepseekMeta = value.providerMetadata?.deepseek || {};
              const groqMeta = value.providerMetadata?.groq || {};
              const xaiCacheMeta = value.providerMetadata?.xai || {};

              const cachedTok =
                toNum(promptDetails.cachedTokens) ??
                toNum(promptDetails.cached_tokens) ??
                toNum(inputTokenDetails.cacheReadTokens) ??  // AI SDK v5 format
                toNum(anthropicUsageMeta.cache_read_input_tokens) ??
                toNum(anthropicUsageMeta.cacheReadInputTokens) ??
                toNum(usage.cacheReadInputTokens) ??
                toNum(usage.cache_read_input_tokens) ??
                toNum(googleUsageMeta.cachedContentTokenCount) ??
                // DeepSeek format
                toNum(usage.prompt_cache_hit_tokens) ??
                toNum(deepseekMeta.prompt_cache_hit_tokens) ??
                // Groq format
                toNum(groqMeta.cache_read_input_tokens) ??
                // xAI format
                toNum(xaiCacheMeta.cache_read_tokens) ??
                toNum(xaiCacheMeta.cached_tokens) ??
                // Generic fallbacks
                toNum(usage.cachedTokens) ??
                toNum(usage.cached_tokens);

              // Extract thinking/reasoning tokens from various provider formats:
              // - AI SDK standard: usage.reasoningTokens
              // - Anthropic: providerMetadata.anthropic.thinking.tokens
              // - OpenAI: providerMetadata.openai.reasoning_tokens
              // - Google: providerMetadata.google.thinkingTokens
              // - DeepSeek: usage.reasoningTokens (DeepSeek uses standard format)
              // - xAI: providerMetadata.xai.reasoning_tokens
              // - OpenRouter: providerMetadata.openrouter.usage.thinkingTokens
              const anthropicMeta = value.providerMetadata?.anthropic || {};
              const openaiMeta = value.providerMetadata?.openai || {};
              const googleMeta = value.providerMetadata?.google || {};
              const xaiMeta = value.providerMetadata?.xai || {};

              const thinkingTok =
                toNum(usage.reasoningTokens) ??
                toNum(usage.reasoning_tokens) ??
                toNum(anthropicMeta.thinking?.tokens) ??
                toNum(openaiMeta.reasoning_tokens) ??
                toNum(googleMeta.thinkingTokens) ??
                toNum(xaiMeta.reasoning_tokens) ??
                toNum(providerMeta.usage?.thinkingTokens);

              return {
                inTok:
                  toNum(usage.promptTokens) ??
                  toNum(usage.prompt_tokens) ??
                  toNum(usage.inputTokens) ??
                  toNum(usage.input_tokens) ??
                  toNum(usage.prompt_tokens_total) ??
                  toNum(usage.input_tokens_total),
                outTok:
                  toNum(usage.completionTokens) ??
                  toNum(usage.completion_tokens) ??
                  toNum(usage.outputTokens) ??
                  toNum(usage.output_tokens) ??
                  toNum(usage.completion_tokens_total) ??
                  toNum(usage.output_tokens_total),
                cachedTok,
                thinkingTok,
                // Actual cost from provider (OpenRouter returns this in providerMetadata)
                cost:
                  toNum(providerMeta.cost) ??
                  toNum(providerMeta.total_cost) ??
                  toNum(usage.cost) ??
                  toNum(usage.total_cost) ??
                  toNum(value.cost),
              };
            };

            // AI SDK v6 + OpenRouter provider: text-delta uses 'text' property
            // (v5 used 'textDelta', some providers use 'delta')
            const textDelta = parsed.text ?? parsed.delta ?? parsed.textDelta;
            if (parsed.type === "text-delta" && typeof textDelta === "string") {
              fullContent += textDelta;

              // Real-time update: Update streaming store immediately for instant UI feedback
              appendStreamingContent(effectiveChatId, textDelta);

              // Batch database updates (debounce to reduce write frequency)
              if (dbUpdateTimeoutRef.current) {
                clearTimeout(dbUpdateTimeoutRef.current);
              }
              dbUpdateTimeoutRef.current = setTimeout(() => {
                updateMessage(assistantMessage.id, {
                  content: fullContent,
                });
              }, 150); // Update DB every 150ms max
            }

            // Handle reasoning/thinking events (from extended thinking models like Claude)
            // AI SDK v6 + OpenRouter provider: uses 'text' property
            const reasoningDelta = parsed.text ?? parsed.delta ?? parsed.textDelta;
            if ((parsed.type === "reasoning" || parsed.type === "reasoning-delta") && typeof reasoningDelta === "string") {
              fullReasoning += reasoningDelta;
              appendStreamingReasoning(effectiveChatId, reasoningDelta);
            }

            if (parsed.type === "tool-call") {
              const now = Date.now();
              toolTimings[parsed.toolCallId] = { start: now };
              // AI SDK v6: 'args' renamed to 'input'
              const toolArgs = parsed.input ?? parsed.args;
              toolCalls.push({
                id: parsed.toolCallId,
                name: parsed.toolName,
                args: toolArgs,
                startTime: now, // Add start time
              });
              // Update streaming store for real-time UI
              setStreamingToolCalls(effectiveChatId, [...toolCalls]);
              await updateMessage(assistantMessage.id, {
                toolCalls: [...toolCalls],
              });
            }

            if (parsed.type === "tool-result") {
              const now = Date.now();
              if (toolTimings[parsed.toolCallId]) {
                toolTimings[parsed.toolCallId].end = now;
              }
              // AI SDK v6: 'args' renamed to 'input', 'result' renamed to 'output'
              const toolArgs = parsed.input ?? parsed.args;
              const toolResult = parsed.output ?? parsed.result;

              // Check if tool result indicates an error
              // Handle multiple error formats: { error: "..." }, { successful: false, error: "..." }, string containing "error:"
              const isToolError = toolResult?.error ||
                toolResult?.isError ||
                toolResult?.successful === false ||
                (toolResult?.result?.error) ||
                (toolResult?.result?.successful === false) ||
                (typeof toolResult === 'string' && toolResult.toLowerCase().includes('error:'));

              toolResults.push({
                id: parsed.toolCallId,
                name: parsed.toolName,
                args: toolArgs,
                result: toolResult,
                endTime: now,
                isError: isToolError,
              });
              // Update streaming store for real-time UI
              setStreamingToolResults(effectiveChatId, [...toolResults]);
              await updateMessage(assistantMessage.id, {
                toolResults: [...toolResults],
              });

              // If tool failed, log it and track for repeated failures
              // The LLM will see the error in the tool result and can try to recover
              if (isToolError) {
                // Extract error message from various formats
                const errorMsg = toolResult?.error ||
                  toolResult?.result?.error ||
                  toolResult?.message ||
                  toolResult?.result?.message ||
                  "Tool execution failed";
                console.warn(`[Chat] Tool ${parsed.toolName} returned error:`, errorMsg);

                // Track consecutive failures for the same tool
                const toolFailKey = `${parsed.toolName}`;
                const currentFailures = (toolResults.filter(r =>
                  r.name === parsed.toolName && r.isError
                ).length);

                // If same tool has failed 2+ times, add a hint for the LLM
                if (currentFailures >= 2) {
                  const hintNote = `\n\n💡 *Note: ${parsed.toolName} has failed ${currentFailures} times. The error suggests: "${errorMsg}". Consider using a different approach or tool.*\n\n`;
                  fullContent += hintNote;
                  appendStreamingContent(effectiveChatId, hintNote);
                }
              }
            }

            // Extract token usage if available (format varies by provider/AI SDK version)
            // Accumulate across all steps (tool calls may have multiple steps)
            const u = extractUsage(parsed);
            if (typeof u.inTok === "number") {
              inputTokens += u.inTok;
              hasReceivedUsage = true;
            }
            if (typeof u.outTok === "number") {
              outputTokens += u.outTok;
              hasReceivedUsage = true;
            }
            if (typeof u.cachedTok === "number") {
              cachedTokens += u.cachedTok;
              hasReceivedUsage = true;
            }
            if (typeof u.thinkingTok === "number") {
              thinkingTokens += u.thinkingTok;
              hasReceivedUsage = true;
            }
            if (typeof u.cost === "number") {
              actualCost += u.cost;
              hasReceivedUsage = true;
            }

            // Handle error events gracefully - don't break the stream
            // Tool errors and transient failures should allow the LLM to recover
            if (parsed.type === "error") {
              const { message, errorCode, provider, retryAfter } = extractStreamError(parsed);
              console.warn("[Chat] Stream error event (continuing):", message, { errorCode, provider });

              // Use structured error code if available, otherwise fall back to message classification
              let errorLabel = "Error";
              let actionHint = "";

              if (errorCode) {
                // Use getErrorMessage for consistent actionable messages
                const context: Record<string, string> = {};
                if (provider) context.provider = provider;
                if (retryAfter) context.retryAfter = String(retryAfter);
                const actionable = getErrorMessage(errorCode as any, context);
                errorLabel = actionable.title;
                if (actionable.action?.href) {
                  actionHint = ` [${actionable.action.label}](${actionable.action.href})`;
                } else if (actionable.description) {
                  actionHint = ` ${actionable.description}`;
                }
              } else {
                // Legacy fallback: categorize by message content
                const lowerMsg = message.toLowerCase();
                if (lowerMsg.includes("model") || lowerMsg.includes("not a valid model")) {
                  errorLabel = "Model error";
                  actionHint = " Try selecting a different model.";
                } else if (lowerMsg.includes("api key") || lowerMsg.includes("unauthorized") || lowerMsg.includes("401") || lowerMsg.includes("403")) {
                  errorLabel = "API error";
                  actionHint = " Check your API key in settings.";
                } else if (lowerMsg.includes("rate limit") || lowerMsg.includes("429") || lowerMsg.includes("quota")) {
                  errorLabel = "Rate limit";
                  actionHint = retryAfter ? ` Wait ${retryAfter} seconds and try again.` : " Wait a moment and try again.";
                } else if (lowerMsg.includes("timeout") || lowerMsg.includes("timed out")) {
                  errorLabel = "Timeout";
                  actionHint = " Try a shorter request.";
                } else if (lowerMsg.includes("tool") || lowerMsg.includes("validation error") || lowerMsg.includes("required at")) {
                  errorLabel = "Tool error";
                }
              }

              // Append error to content so user sees it, but don't break the stream
              const errorNote = `\n\n⚠️ *${errorLabel}: ${message}*${actionHint}\n\n`;
              fullContent += errorNote;
              appendStreamingContent(effectiveChatId, errorNote);
            }

            // Handle tool-retry-exhausted events (tool failed after retries)
            if (parsed.type === "tool-retry-exhausted") {
              const failureNote = `\n\n⚠️ *${parsed.toolName} failed after ${parsed.failCount} attempts. ${parsed.suggestion || ""}*\n\n`;
              fullContent += failureNote;
              appendStreamingContent(effectiveChatId, failureNote);
            }
          } catch (e) {
            // Only log parse errors, don't break the stream
            console.warn("Failed to parse stream data:", data, e);
          }
        }
      }

      // Flush any remaining buffer content (handles streams that don't end with newline)
      if (buffer.trim()) {
        const remaining = buffer.trim();
        if (remaining.startsWith("data: ")) {
          const data = remaining.slice(6);
          if (data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data);
              // Process usage/finish events that may be in the final chunk
              if (parsed.type === "step-finish" || parsed.type === "finish") {
                console.log(`[use-chat] Final buffer ${parsed.type} event:`, JSON.stringify(parsed).slice(0, 500));
              }
            } catch {
              // Ignore parse errors in final buffer
            }
          }
        }
      }

      // If provider didn't supply usage, fall back to local estimation so cost isn't stuck at 0.
      if (!hasReceivedUsage) {
        try {
          // llmMessages is the actual request payload we sent to the server.
          // Map it into Message-like objects so token-counter utilities can be reused.
          const approxInput = countMessagesTokens(
            llmMessages.map((m, idx) => ({
              id: `req_${idx}`,
              chatId: effectiveChatId,
              role: m.role,
              content: m.content as any,
              createdAt: Date.now(),
            }))
          );
          const approxOutput = countTokens(fullContent || "");
          inputTokens = approxInput;
          outputTokens = approxOutput;
          costIsEstimated = true;
        } catch {
          // If estimation fails for any reason, fall back to 0/0 (cost will be 0).
          inputTokens = 0;
          outputTokens = 0;
        }
      }

      // Use actual cost from provider if available, otherwise estimate
      let cost: number;

      if (typeof actualCost === "number" && actualCost > 0) {
        cost = actualCost;
        costIsEstimated = false;
      } else {
        cost = estimateCost(inputTokens || 0, outputTokens || 0, modelId, providerId);
        // costIsEstimated is already true if we fell back to local token counting
      }

      // Detect incomplete response (ends abruptly without punctuation AND is very long)
      const isIncomplete =
        fullContent.length > 0 &&
        !/[.!?]$/.test(fullContent.trim()) && fullContent.length > 3000;

      // Calculate cache savings from prompt caching
      const cacheSavings = cachedTokens > 0
        ? calculateCacheSavings(cachedTokens, modelId, providerId)
        : 0;

      // Update the assistant message with full content and metadata
      await updateMessage(assistantMessage.id, {
        content: fullContent,
        reasoning: fullReasoning || undefined,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
        thinkingTokens: thinkingTokens > 0 ? thinkingTokens : undefined,
        cacheSavings: cacheSavings > 0 ? cacheSavings : undefined,
        cost,
        costIsEstimated: costIsEstimated || undefined,
        isIncomplete,
        canContinue: isIncomplete,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      });

      // Update chat's total cost and cache savings (activeBranchLeafId already set when assistant message was created)
      const currentTotalCost = chat.totalCost || 0;
      const currentTotalCacheSavings = chat.totalCacheSavings || 0;
      await updateChat(effectiveChatId, {
        totalCost: currentTotalCost + cost,
        totalCacheSavings: currentTotalCacheSavings + cacheSavings,
      });

      // Auto-generate title after the first exchange
      // We check if:
      // 1. The chat title is likely the default "New Chat" (we'll check the DB/cache state ideally, but here we can try)
      // 2. We just finished the first real assistant response (history length is small)
      if (chat.title === "New Chat" && rawHistory.length <= 1) { // rawHistory is PRE-current-generation, so 0 or 1 items usually
        // We can fire-and-forget this
        (async () => {
          try {

            // Read title model settings from IndexedDB (client-side only!)
            const { getSettings } = await import("@/lib/db/queries");
            const settings = await getSettings();

            const DEFAULT_TITLE_MODELS: Record<string, string> = {
              openrouter: "openai/gpt-4o-mini",
              openai: "gpt-4o-mini",
              anthropic: "claude-3-haiku-20240307",
              groq: "llama-3.1-8b-instant",
            };

            const titleModelId =
              settings?.titleModelIdsByProvider?.[providerId] ||
              settings?.titleModelId ||
              DEFAULT_TITLE_MODELS[providerId] ||
              "gpt-4o-mini";


            const titleResponse = await fetch("/api/chat/title", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiKey?.key ? { "X-API-Key": apiKey.key } : {}),
              },
              body: JSON.stringify({
                messages: [
                  ...llmMessages,
                  { role: "assistant", content: fullContent }
                ],
                modelId,
                providerId,
                providerBaseUrl: apiKey?.baseUrl,
                apiKey: apiKey?.key,
                titleModelId, // Pass the configured model from settings
              })
            });

            if (titleResponse.ok) {
              const data = await titleResponse.json();
              const { title, cost: titleCost, errorCode, error: errorMsg, provider: errorProvider } = data;

              // Check for API key errors in the response (backend returns 200 with error info for graceful degradation)
              if (errorCode && (errorCode === "API_KEY_INVALID" || errorCode === "API_KEY_MISSING")) {
                const context: Record<string, string> = {};
                if (errorProvider) context.provider = errorProvider;
                const actionable = getErrorMessage(errorCode as any, context);
                toast.error(actionable.title, { description: actionable.description });
              }

              if (title && title.length > 0) {
                // Add title generation cost to chat total
                const chatForCost = await getChatById(effectiveChatId);
                const newTotalCost = (chatForCost?.totalCost || 0) + (titleCost || 0);
                await updateChat(effectiveChatId, { title, totalCost: newTotalCost });
              }
            } else {
              console.error("[Chat] Failed to generate title:", titleResponse.status, titleResponse.statusText);
            }
          } catch (err) {
            console.error("Failed to auto-generate title:", err);
            // Silently fail, it's just a title
          }
        })();
      }

      // Schedule memory extraction after assistant response
      scheduleMemoryExtraction();


      // Auto-summarize every 10 messages
      const updatedMessages = await getMessages(effectiveChatId);
      if (updatedMessages.length > 0 && updatedMessages.length % 10 === 0) {
        // Map to ai UIMessages for the utility
        const aiMessages: UIMessage[] = updatedMessages.map((m: Message) => ({
          id: m.id,
          role: m.role as any,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          createdAt: new Date(m.createdAt),
          parts: [{ type: 'text' as const, text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
        }));
        generateAndApplySummary({ chatId: effectiveChatId, messages: aiMessages, keys }).catch(console.error);
      }
    } catch (error) {
      // Clear connection timeout on error
      if (connectionTimeoutId) {
        clearTimeout(connectionTimeoutId);
      }

      // Handle abort gracefully - don't show as error
      if (error instanceof Error && error.name === "AbortError") {
        // Check abort reason: 'user-cancelled' means user clicked stop/force send
        // DOMException from AbortController has a reason property when abort(reason) is called
        const abortReason = (error as any).reason || (error as DOMException).message;
        const isUserCancelled = abortReason === 'user-cancelled';

        // User-initiated cancellations are handled by cancelRequest - don't double-update
        if (isUserCancelled) {
          return; // cancelRequest already handled the message update
        }

        // This was a timeout (connection timeout, not user cancellation)
        await updateMessage(assistantMessage.id, {
          content: fullContent || "⏱️ Connection timed out. Please try again.",
          isIncomplete: !!fullContent,
          canContinue: false,
        });
        return; // Don't re-throw for cancelled requests
      }
      // Update the assistant message with the error so it's visible in the chat
      const errorText = error instanceof Error ? error.message : "An error occurred";
      await updateMessage(assistantMessage.id, {
        content: fullContent || "",
        error: errorText,
      });
      throw error; // Re-throw so outer handlers can still process it
    } finally {
      // Clear abort controller
      abortControllerRef.current = null;
      // Always clear pending DB update timeout
      if (dbUpdateTimeoutRef.current) {
        clearTimeout(dbUpdateTimeoutRef.current);
        dbUpdateTimeoutRef.current = null;
      }
      // Delay clearing streaming state to allow the UI to catch up
      // This fixes a race condition where Dexie's live query hasn't updated yet
      // and the MessageItem hasn't mounted to consume the streaming content
      if (streamingClearTimeoutRef.current) {
        clearTimeout(streamingClearTimeoutRef.current);
      }
      streamingClearTimeoutRef.current = setTimeout(() => {
        clearStreaming(effectiveChatId);
        streamingClearTimeoutRef.current = null;
        // Process next queued message if any
        processNextInQueue(effectiveChatId);
      }, 150);

      // Refresh memory cache in background for next interaction
      // This keeps memories fresh without blocking the current response
      refreshCacheInBackground(userMessageText);

      // Run memory decay in background (once per day, non-blocking)
      runMemoryDecay().catch(() => {});
    }
  }, [chatId, getKeyForProvider, isProviderKeyLocked, requestVaultUnlock, keys, scheduleMemoryExtraction, setStreamingMessage, appendStreamingContent, appendStreamingReasoning, setStreamingToolCalls, setStreamingToolResults, upsertStreamingApproval, removeStreamingApproval, clearStreaming, startPipeline, setStepRunning, setStepComplete, setStepError, setStepRetrying, completePipeline, failPipeline, clearPipeline, setActiveSkill, setImageGenerationProgress, clearImageGenerationProgress, setOptimisticMessage, clearOptimisticMessage, setPendingSkillApproval, setContextCompaction]);

  // Process next message in queue after streaming completes
  const processNextInQueue = useCallback(async (targetChatId: string) => {
    const { getQueue, dequeueMessage } = useStreamingStore.getState();
    const queue = getQueue(targetChatId);

    if (queue.length === 0) return;

    // Safety check: don't process if still streaming
    const { getChatStream } = useStreamingStore.getState();
    const chatState = getChatStream(targetChatId);
    if (chatState.streamingMessageId !== null) return;

    const nextMessage = dequeueMessage(targetChatId);
    if (!nextMessage) return;

    // Look up skill by ID if one was stored
    const skill = nextMessage.skill ? await getSkillById(nextMessage.skill) : null;

    // Use the ref to get the latest sendMessage function (avoids stale closure)
    if (sendMessageRef.current) {
      await sendMessageRef.current(nextMessage.content, nextMessage.attachments, skill || null);
    }
  }, []);

  const sendMessage = async (content: MessageContent, attachments?: Array<{ name: string; content: string }>, selectedSkill?: Skill | null) => {
    setIsLoading(true);
    setError(null);

    let actualChatId = chatId;

    try {
      // Handle draft mode - create chat if chatId is null
      if (!actualChatId) {
        const { draftChatConfig } = useUIStore.getState();
        if (!draftChatConfig) {
          throw new Error("No draft chat configuration found");
        }

        // Create chat with draft config
        const { createChat } = await import("@/lib/db/queries");
        const newChat = await createChat({
          title: "New Chat",
          modelId: draftChatConfig.modelId,
          providerId: draftChatConfig.providerId,
          executionTarget: draftChatConfig.executionTarget || useSettingsStore.getState().defaultExecutionTarget || "lumina",
          projectId: draftChatConfig.projectId,
          activeMcpServerIds: draftChatConfig.activeMcpServerIds || [],
          reasoningLevel: (draftChatConfig.reasoningLevel as "low" | "medium" | "high" | "xhigh") || "medium",
          temperature: draftChatConfig.temperature,
          maxTokens: draftChatConfig.maxTokens,
        });

        actualChatId = newChat.id;

        // Update UI store to show the new chat and clear draft
        useUIStore.getState().setActiveChatId(newChat.id);
        useUIStore.getState().clearDraftChatConfig();
      }

      let chat = await getChatById(actualChatId);
      if (!chat) throw new Error("Chat not found");

      // Check for @agent mention - if found, switch to that agent
      const messageText = getTextFromMessageContent(content);
      const agentMentionMatch = messageText.match(/@agent:([^\[]+)\[([^\]]+)\]/);
      if (agentMentionMatch) {
        const mentionedAgentId = agentMentionMatch[1];
        const mentionedAgent = await getAgentById(mentionedAgentId);
        if (mentionedAgent) {
          // Switch the chat to use the mentioned agent
          await updateChat(actualChatId, {
            agentId: mentionedAgent.id,
            modelId: mentionedAgent.modelId || chat.modelId,
            activeMcpServerIds: mentionedAgent.mcpServerIds || [],
          });
          // Refresh chat data after update
          chat = await getChatById(actualChatId);
          if (!chat) throw new Error("Chat not found after agent switch");
        }
      }

      if (chat.agentId) {
        incrementAgentUsage(chat.agentId).catch(() => { });
      }

      const images = getImagesFromMessageContent(content);
      if (images.length > 0) {
        const modelId = chat.modelId;
        const caps = getModelCapabilities(modelId);
        if (!caps.supportsVision) {
          throw new Error(
            `Selected model (${modelId}) does not support images. ` +
            `Try a vision-capable model like Claude Sonnet 4.5, GPT-5, or Gemini 3 Flash.`
          );
        }
      }

      const parentId = chat.activeBranchLeafId || (await getLastMessage(actualChatId))?.id;

      // Add user message to database with original content
      const userMessage = await addMessage({
        chatId: actualChatId,
        role: "user",
        content,
        parentId,
      });

      // Clear optimistic message immediately - user message is now in DB and will appear via live query
      clearOptimisticMessage(actualChatId);

      // Update chat's updatedAt timestamp
      await updateChat(actualChatId, { activeBranchLeafId: userMessage.id });

      // Auto-detect skill if none selected
      // Also captures the query embedding from skill matching to reuse for memory search
      // (one remote API call instead of two)
      let activeSkill: Skill | null = selectedSkill || null;
      let sharedQueryEmbedding: number[] | undefined;
      if (!activeSkill) {
        try {
          const settings = await getSettings();
          const embeddingsProvider = settings?.embeddingsProvider;
          const embeddingsModelId = settings?.embeddingsModelId;

          const threshold = settings?.skillMatchThreshold ?? 0.25;

          // Sticky skill: check if the last assistant message used a skill
          let stickySkill: Skill | null = null;
          try {
            const recentMsgs = await getMessages(actualChatId);
            const lastAssistantMsg = recentMsgs.filter((m: Message) => m.role === 'assistant').pop();
            if (lastAssistantMsg?.skillId) {
              const prevSkill = await getSkillById(lastAssistantMsg.skillId);
              if (prevSkill?.isEnabled) {
                stickySkill = prevSkill;
              }
            }
          } catch {
            // Non-critical — continue without sticky skill
          }

          if (embeddingsProvider && embeddingsModelId) {
            const embeddingsApiKey = getKeyForProvider(embeddingsProvider);

            if (embeddingsApiKey?.key) {
              // Get recent conversation context for short messages like "retry", "continue"
              let conversationContext: Array<{ role: string; content: string }> | undefined;
              if (messageText.length < 20) {
                const recentMessages = await getMessages(actualChatId);
                conversationContext = recentMessages.slice(-4).map((m: Message) => ({
                  role: m.role,
                  content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                }));
              }

              // Use matchSkillWithEmbedding to get BOTH the match and the query embedding
              // The embedding is reused for memory search (avoids a second API call)
              const { match: matchResult, queryEmbedding: skillQueryEmbedding } = await matchSkillWithEmbedding(
                messageText,
                embeddingsApiKey.key,
                {
                  providerId: embeddingsProvider,
                  modelId: embeddingsModelId,
                  threshold,
                  excludeManualOnly: true, // Only match auto-trigger skills
                  conversationContext,
                  excludePrefix: "skill_builtin_lumina_",
                }
              );

              // Capture the embedding for reuse in memory search
              if (skillQueryEmbedding) {
                sharedQueryEmbedding = skillQueryEmbedding;
              }

              if (stickySkill) {
                // Sticky skill logic: keep the previous skill unless a *different* skill
                // matches with high confidence (above SKILL_SWITCH_THRESHOLD)
                activeSkill = stickySkill;
                if (matchResult && matchResult.skill.id !== stickySkill.id && matchResult.similarity >= SKILL_SWITCH_THRESHOLD) {
                  // Confident switch to a different skill
                  activeSkill = matchResult.skill;
                }
              } else if (matchResult) {
                // No sticky skill — use standard matching flow
                // Check if skill requires approval
                if (matchResult.skill.requireApproval) {
                  // Ensure we have a valid chat ID for skill approval
                  if (!actualChatId) {
                    throw new Error("Cannot show skill approval dialog without a valid chat");
                  }
                  // Show approval dialog and wait for user decision
                  const approved = await new Promise<boolean>((resolve) => {
                    // Non-null assertion is safe here because we checked above
                    setPendingSkillApproval(actualChatId!, {
                      skill: {
                        id: matchResult.skill.id,
                        name: matchResult.skill.name,
                        icon: matchResult.skill.ui.icon,
                        color: matchResult.skill.ui.color,
                        activeLabel: matchResult.skill.ui.activeLabel,
                      },
                      messageContent: content,
                      attachments,
                      resolve,
                    });
                  });

                  if (approved) {
                    activeSkill = matchResult.skill;
                  }
                } else {
                  activeSkill = matchResult.skill;
                }
              }
              // Note: Missing embeddings warning removed - auto-generation handles this in background
              // See loadEmbeddingsCache() in skill-embeddings.ts
            } else if (stickySkill) {
              // No embeddings API key but we have a sticky skill — keep it
              activeSkill = stickySkill;
            }
          } else if (stickySkill) {
            // No embeddings provider configured but we have a sticky skill — keep it
            activeSkill = stickySkill;
          }
        } catch (err) {
          // Skill detection is optional - fail silently without showing error to user
          // Common causes: network issues, API key problems, embedding service down
          // The message will still be sent without skill enhancement
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.warn(`[Chat] Skill auto-detection failed (continuing without skill): ${errorMessage}`);
        }
      }

      if (isMultiModelMode && multiModelPanels.length >= 2) {
        // Multi-model mode: send to all active model panels in parallel
        // Use allSettled so one model failure doesn't abort the others
        const modelIds = multiModelPanels.map(panel => panel.modelId);
        const results = await Promise.allSettled(
          modelIds.map(modelId => generateResponse(content, attachments, modelId, userMessage.id, activeSkill, actualChatId!, sharedQueryEmbedding))
        );
        // Report individual failures without throwing (so the hook doesn't go into error state)
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === "rejected") {
            const failedModelId = modelIds[i];
            const { title, description } = getActionableError(result.reason);
            // Prefix with model name for clarity
            const modelName = failedModelId.split("/").pop()?.replace(/-/g, " ") || failedModelId;
            toast.error(`${modelName}: ${title}`, { description });
          }
        }
      } else {
        await generateResponse(content, attachments, undefined, userMessage.id, activeSkill, actualChatId!, sharedQueryEmbedding);
      }

    } catch (err) {
      handleError(err);
      // Ensure all state is cleared on error
      // Use chatId from closure if actualChatId wasn't set (error before chat creation)
      const idToClear = actualChatId || chatId;
      if (idToClear) {
        clearStreaming(idToClear);
        clearPipeline(idToClear);
        clearOptimisticMessage(idToClear);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Keep the ref updated with the latest sendMessage function
  sendMessageRef.current = sendMessage;

  const editMessage = async (messageId: string, newContent: string) => {
    if (!chatId) {
      throw new Error("Cannot edit message without a valid chat");
    }

    setIsLoading(true);
    setError(null);

    try {
      const message = await getMessageById(messageId);
      if (!message || message.chatId !== chatId) throw new Error("Message not found");
      if (message.role !== "user") throw new Error("Only user messages can be edited");

      // Create a new branch user message (sibling) instead of overwriting history.
      const branchedUser = await addMessage({
        chatId: chatId!,
        role: "user",
        content: newContent,
        parentId: message.parentId,
      });

      const hasBranches = await chatHasBranches(chatId!);
      await updateChat(chatId!, {
        activeBranchLeafId: branchedUser.id,
        hasBranches,
      });

      await generateResponse(newContent, undefined, undefined, branchedUser.id);

    } catch (err) {
      handleError(err);
      clearStreaming(chatId!);
      clearPipeline(chatId!);
    } finally {
      setIsLoading(false);
    }
  };

  const continueResponse = async (messageId: string) => {
    if (!chatId) {
      throw new Error("Cannot continue response without a valid chat");
    }

    setIsLoading(true);
    setError(null);
    setContinuingMessageId(messageId);

    try {
      const message = await getMessageById(messageId);
      if (!message || message.chatId !== chatId) throw new Error("Message not found");

      const continuePrompt = "Please continue your previous response.";
      const continueUser = await addMessage({
        chatId: chatId!,
        role: "user",
        content: continuePrompt,
        parentId: messageId,
      });
      await updateChat(chatId!, { activeBranchLeafId: continueUser.id });

      await updateMessage(messageId, { canContinue: false });
      await generateResponse(continuePrompt, undefined, undefined, continueUser.id);

    } catch (err) {
      handleError(err);
      clearStreaming(chatId!);
      clearPipeline(chatId!);
    } finally {
      setIsLoading(false);
      setContinuingMessageId(null);
    }
  };

  const regenerateAssistant = async (assistantMessageId: string) => {
    if (!chatId) {
      throw new Error("Cannot regenerate assistant without a valid chat");
    }

    setIsLoading(true);
    setError(null);

    try {
      const assistant = await getMessageById(assistantMessageId);
      if (!assistant || assistant.chatId !== chatId) throw new Error("Message not found");
      if (assistant.role !== "assistant") throw new Error("Can only regenerate assistant messages");
      if (!assistant.parentId) throw new Error("No parent message to regenerate from");

      const parentUser = await getMessageById(assistant.parentId);
      if (!parentUser || parentUser.chatId !== chatId || parentUser.role !== "user") {
        throw new Error("Parent user message not found");
      }

      const hasBranches = await chatHasBranches(chatId!);
      await updateChat(chatId!, { activeBranchLeafId: assistant.parentId, hasBranches });
      await generateResponse(parentUser.content, undefined, undefined, parentUser.id);
    } catch (err) {
      handleError(err);
      clearStreaming(chatId!);
      clearPipeline(chatId!);
    } finally {
      setIsLoading(false);
    }
  };

  const resendMessage = async (userMessageId: string) => {
    if (!chatId) {
      throw new Error("Cannot resend message without a valid chat");
    }

    setIsLoading(true);
    setError(null);

    try {
      const userMessage = await getMessageById(userMessageId);
      if (!userMessage || userMessage.chatId !== chatId) throw new Error("Message not found");
      if (userMessage.role !== "user") throw new Error("Can only resend user messages");

      // Generate a new response for this user message
      await generateResponse(userMessage.content, undefined, undefined, userMessageId);
    } catch (err) {
      handleError(err);
      clearStreaming(chatId!);
      clearPipeline(chatId!);
    } finally {
      setIsLoading(false);
    }
  };

  const handleError = (err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : "An error occurred";
    setError(errorMessage);
    // Log as warning to avoid triggering Next.js error overlay in dev mode
    console.warn("[Chat Error]", errorMessage);

    // Use actionable error messages for better UX
    const { title, description, action } = getActionableError(err);
    toast.error(title, {
      description,
      action: action?.onClick ? {
        label: action.label,
        onClick: action.onClick,
      } : undefined,
    });
  };

  const cancelRequest = useCallback(async () => {
    if (!chatId) {
      return; // Nothing to cancel in draft mode
    }

    if (abortControllerRef.current) {
      // IMPORTANT: Capture state snapshot atomically BEFORE any async operations
      // This prevents race conditions where state could change during the async DB call
      const chatState = getChatStream(chatId!);
      const { streamingContent, streamingMessageId, streamingReasoning, streamingToolCalls } = chatState;

      // Signal abort immediately with reason to distinguish from timeout
      abortControllerRef.current.abort('user-cancelled');
      abortControllerRef.current = null;
      setIsLoading(false);

      // Clear streaming state BEFORE async operations to prevent stale reads
      // This ensures no other code path can see inconsistent state
      clearStreaming(chatId!);

      // Save partial content to DB using the captured snapshot (not live state)
      if (streamingMessageId && streamingContent && streamingContent.trim().length > 0) {
        try {
          await updateMessage(streamingMessageId, {
            content: streamingContent + '\n\n*[Response cancelled by user]*',
            reasoning: streamingReasoning || undefined,
            isIncomplete: true,
            canContinue: true, // Allow continuing from where it stopped
            // Preserve any tool calls that were in progress
            toolCalls: streamingToolCalls && streamingToolCalls.length > 0
              ? streamingToolCalls.map(tc => ({
                  toolName: tc.toolName,
                  args: tc.args || tc.input,
                  result: undefined, // Tool was interrupted
                }))
              : undefined,
          });
        } catch (error) {
          console.error('[Cancel] Failed to save partial content:', error);
        }
      }

      // Process next queued message after cancellation
      setTimeout(() => {
        processNextInQueue(chatId!);
      }, 200);
    }
  }, [chatId, getChatStream, clearStreaming, processNextInQueue]);

  return {
    sendMessage,
    editMessage,
    continueResponse,
    regenerateAssistant,
    resendMessage,
    cancelRequest,
    isLoading,
    error,
    continuingMessageId,
  };
}
