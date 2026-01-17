import { useState, useCallback, useRef, useEffect } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useUIStore } from "@/stores/ui-store";
import { useStreamingStore, type ActiveSkill } from "@/stores/streaming-store";
import { addMessage, updateChat, getChatById, updateMessage, getMessagesForBranch, getLastMessage, getMessageById, chatHasBranches, incrementAgentUsage, getMessages, getActiveMcpServersForChat, getAgentById, getSkillById, incrementSkillUsage } from "@/lib/db/queries";
import { buildContextMessages } from "@/lib/ai/context-builder";
import { countMessagesTokens, countTokens, estimateCost } from "@/lib/utils/token-counter";
import type { MessageContent, Agent, Skill } from "@/lib/db/schema";
import { getImagesFromMessageContent, getTextFromMessageContent, mapTextInMessageContent, convertToAISDKContent } from "@/lib/utils/message-content";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { toast } from "sonner";
import { isModelIdCompatibleWithProviderId, pickBestProviderId, providerLabel } from "@/lib/ai/provider-routing";
import { addMemory, refreshCacheInBackground } from "@/lib/memory";
import { generateAndApplySummary } from "@/lib/ai/summarization";
import { getSettings } from "@/lib/db/queries";
import { matchSkill } from "@/lib/skills/skill-matcher";
import type { Message } from "ai";

function cleanReferencesForLLM(content: string) {
  return content
    .replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]")
    .replace(/@chat:[^\[]+\[([^\]]+)\]/g, "[$1]");
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
 */
async function handleImageGeneration(
  chatId: string,
  modelId: string,
  providerId: string,
  apiKey: { key: string; baseUrl?: string } | undefined,
  prompt: string,
  parentUserMessageId?: string,
  signal?: AbortSignal,
  agentSystemPrompt?: string
): Promise<void> {
  const { addMessage, updateMessage, updateChat, getChatById } = await import("@/lib/db/queries");

  // Create assistant message placeholder
  const assistantMessage = await addMessage({
    chatId,
    role: "assistant",
    content: [{ type: "text", text: agentSystemPrompt ? "🎨 Crafting your prompt..." : "🎨 Generating image..." }],
    modelId,
    parentId: parentUserMessageId,
  });

  // Update activeBranchLeafId immediately so the UI shows the new message
  // and branch state is consistent even if generation fails
  await updateChat(chatId, { activeBranchLeafId: assistantMessage.id });

  try {
    // If there's an agent system prompt, optimize the image prompt first
    let finalPrompt = prompt;
    if (agentSystemPrompt) {
      console.log("[Image Gen] Optimizing prompt with agent system prompt...");
      await updateMessage(assistantMessage.id, {
        content: [{ type: "text", text: "🎨 Crafting optimized prompt..." }],
      });
      finalPrompt = await generateOptimizedImagePrompt(prompt, agentSystemPrompt, apiKey, signal);
      console.log("[Image Gen] Optimized prompt:", finalPrompt.substring(0, 200) + "...");
      await updateMessage(assistantMessage.id, {
        content: [{ type: "text", text: "🎨 Generating image..." }],
      });
    }

    console.log("[Image Gen] providerId:", providerId, "apiKey:", apiKey?.key ? "present" : "MISSING");
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
        size: "1024x1024",
        quality: "standard",
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as any)?.error || response.statusText;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const images = (data as any).images || [];

    if (images.length === 0) {
      throw new Error("No images generated");
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
    // Update message with error
    const errorText = error instanceof Error ? error.message : "Image generation failed";
    await updateMessage(assistantMessage.id, {
      content: `❌ ${errorText}`,
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
    const response = await fetch("/api/agents/pipeline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey?.key ? { "X-API-Key": apiKey.key } : {}),
      },
      body: JSON.stringify({
        pipeline: agent.pipeline,
        userInput,
        userImages: userImages || [],  // Pass images for vision models
        chatId,
        providerBaseUrl: apiKey?.baseUrl,
        mcpServers,
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
              if (!event.continuing) {
                throw new Error(event.error);
              }
              break;

            case "step-retry":
              // Update UI to show retry attempt
              await updateMessage(assistantMessage.id, {
                content: [{ type: "text", text: `🔄 Retrying step (attempt ${event.retryCount})...` }],
              });
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
          if (e instanceof Error && e.message !== "Failed to parse stream data") {
            throw e;
          }
          console.warn("Failed to parse pipeline stream data:", data);
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

export function useChat(chatId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const { keys, getKeyForProvider } = useApiKeysStore();
  const { isArenaMode, arenaModelIds } = useUIStore();
  const {
    setStreamingMessage,
    appendStreamingContent,
    appendStreamingReasoning,
    setStreamingToolCalls,
    setStreamingToolResults,
    clearStreaming,
    startPipeline,
    setStepRunning,
    setStepComplete,
    setStepError,
    completePipeline,
    failPipeline,
    clearPipeline,
    setOptimisticMessage,
    clearOptimisticMessage,
    setActiveSkill,
    clearActiveSkill,
  } = useStreamingStore();
  const extractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dbUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pipelineClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Schedule memory extraction after assistant response (debounced)
  const scheduleMemoryExtraction = useCallback(async () => {
    // Clear any pending extraction
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current);
    }

    // Debounce: wait 20 seconds after last assistant response
    extractionTimeoutRef.current = setTimeout(async () => {
      try {
        const settings = await getSettings();
        const autoExtract = settings?.memoryAutoExtract ?? true; // Default to true
        if (!settings?.memoryEnabled || !autoExtract) return;

        const messages = await getMessages(chatId);
        if (messages.length >= 2) {
          // Get last exchange (User + Assistant) for context
          const recentMessages = messages.slice(-2).map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : getTextFromMessageContent(m.content)
          }));
          await addMemory(recentMessages);
          console.log("[Chat] Sent recent interaction to Mem0 for learning");
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
        // Flush immediately
        getMessages(chatId).then(async (messages) => {
          const settings = await getSettings();
          const autoExtract = settings?.memoryAutoExtract ?? true;
          if (settings?.memoryEnabled && autoExtract && messages.length >= 2) {
            const recentMessages = messages.slice(-2).map(m => ({
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
      // Clear streaming state immediately when switching chats
      clearStreaming();
    };
  }, [chatId, clearStreaming]);

  const generateResponse = useCallback(async (
    messageContent: MessageContent,
    attachments?: Array<{ name: string; content: string }>,
    overrideModelId?: string,
    parentUserMessageId?: string,
    activeSkill?: Skill | null
  ) => {
    // Extract user message text for later use (e.g., background memory refresh)
    const userMessageText = getTextFromMessageContent(messageContent);

    // Get chat details for model info
    const chat = await getChatById(chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    // Get agent for system prompt and other settings
    // Use chat.modelId for the model - agent's default is copied there when selected,
    // and user changes via dropdown update chat.modelId
    const agent = chat.agentId ? await getAgentById(chat.agentId) : undefined;
    const modelId = overrideModelId || chat.modelId;

    const llmProviderIds = Array.from(
      new Set(
        keys
          .map((k) => k.provider)
          .filter((p) =>
            ["openrouter", "openai", "anthropic", "groq", "together", "perplexity", "anyscale", "ollama", "lmstudio"].includes(p) ||
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
    const providerKeyRequired = !["ollama", "lmstudio"].includes(providerId);
    if (providerKeyRequired && !apiKey) {
      throw new Error(`Missing API key for ${providerLabel(providerId)}.`);
    }

    const enabledTools = chat.enabledTools || [];
    const images = getImagesFromMessageContent(messageContent);
    const modelCaps = getModelCapabilities(modelId);

    if (images.length > 0 && !modelCaps.supportsVision) {
      throw new Error(`Selected model (${modelId}) does not support images.`);
    }

    // Check if this is a pipeline agent
    if (agent?.executionType === "pipeline" && agent.pipeline?.steps?.length) {
      abortControllerRef.current = new AbortController();
      try {
        // Get MCP servers for tool steps
        const mcpServers = await getActiveMcpServersForChat(chat.activeMcpServerIds || agent.mcpServerIds || []);

        // Extract images from message content for vision-enabled pipeline steps
        const userImages = getImagesFromMessageContent(messageContent);

        await handlePipelineExecution(
          chatId,
          agent,
          apiKey,
          getTextFromMessageContent(messageContent),
          userImages,  // Pass images for vision models in pipeline
          parentUserMessageId,
          abortControllerRef.current.signal,
          {
            startPipeline,
            setStepRunning,
            setStepComplete,
            setStepError,
            completePipeline,
            failPipeline,
            clearPipeline,
          },
          mcpServers
        );
        // Pipeline completed successfully - clear after delay for UI to catch up
        if (pipelineClearTimeoutRef.current) {
          clearTimeout(pipelineClearTimeoutRef.current);
        }
        pipelineClearTimeoutRef.current = setTimeout(() => {
          clearPipeline();
          pipelineClearTimeoutRef.current = null;
        }, 1000);
        return;
      } catch (error) {
        // Clear pipeline state immediately on error
        clearPipeline();
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
        return await handleImageGeneration(
          chatId,
          modelId,
          providerId,
          apiKey,
          getTextFromMessageContent(messageContent),
          parentUserMessageId,
          abortControllerRef.current.signal,
          agent?.systemPrompt // Pass agent's system prompt for prompt optimization
        );
      } finally {
        abortControllerRef.current = null;
      }
    }

    // Set active skill in streaming store if provided (for UI indicator)
    if (activeSkill) {
      setActiveSkill({
        id: activeSkill.id,
        name: activeSkill.name,
        icon: activeSkill.ui.icon,
        color: activeSkill.ui.color,
        activeLabel: activeSkill.ui.activeLabel,
      });
      // Increment skill usage
      incrementSkillUsage(activeSkill.id).catch(() => {});
    }

    const contextMessages = await buildContextMessages(
      getTextFromMessageContent(messageContent),
      chatId,
      { memoryDisabled: chat.memoryDisabled, skill: activeSkill }
    );

    // Memories are already loaded by buildContextMessages() - no duplicate call needed
    const history = await getMessagesForBranch(chatId, parentUserMessageId);

    const llmMessages = [
      ...contextMessages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      ...(attachments || []).map((file) => ({
        role: "system" as const,
        content: `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\``,
      })),
      ...history
        .filter(
          (m) => m.role === "system" || m.role === "user" || m.role === "assistant"
        )
        .map((m) => {
          const role = m.role as "system" | "user" | "assistant";
          // Clean references for user messages first
          let content = role === "user"
            ? mapTextInMessageContent(m.content, cleanReferencesForLLM)
            : m.content;
          // Convert to AI SDK format (image_url -> image for users, strip images from assistants)
          return {
            role,
            content: convertToAISDKContent(content, role),
          };
        }),
    ];

    // Add empty assistant message that we'll update during streaming
    const assistantMessage = await addMessage({
      chatId,
      role: "assistant",
      content: "",
      modelId,
      isArena: !!overrideModelId,
      parentId: parentUserMessageId,
      skillId: activeSkill?.id, // Store which skill was active
    });

    // Update activeBranchLeafId immediately so the UI shows the new message
    // and subsequent operations have the correct parent reference
    await updateChat(chatId, { activeBranchLeafId: assistantMessage.id });

    // Set streaming state for real-time UI updates
    setStreamingMessage(assistantMessage.id);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Track content for abort handling (needs to be outside try block for catch access)
    let fullContent = "";

    // Connection timeout for mobile networks (30 seconds)
    const connectionTimeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }, 30000);

    try {
    // Call API route for streaming
    const response = await fetch("/api/chat", {
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
        enabledTools,
        mcpServers: await getActiveMcpServersForChat(chat.activeMcpServerIds),
      }),
      signal: abortControllerRef.current.signal,
    });

    // Clear connection timeout once response is received
    clearTimeout(connectionTimeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as any)?.error || (errorData as any)?.message || response.statusText;
      throw new Error(errorMessage);
    }

    // Handle streaming response with real-time updates
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    fullContent = ""; // Reset content tracking
    let fullReasoning = ""; // For extended thinking / reasoning
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let actualCost: number | undefined; // Actual cost from provider (OpenRouter, etc.)
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

          // Debug: Log all event types to trace tool events
          if (parsed.type && !['text-delta'].includes(parsed.type)) {
            console.log(`[Chat Stream] Event type: ${parsed.type}`, parsed);
          }

          const extractUsage = (value: any): { inTok?: number; outTok?: number; cost?: number } => {
            if (!value || typeof value !== "object") return {};
            const usage = (value.usage && typeof value.usage === "object") ? value.usage : value;

            const toNum = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

            // OpenRouter returns cost in experimental_providerMetadata.openrouter
            const providerMeta = value.experimental_providerMetadata?.openrouter ||
                                 value.providerMetadata?.openrouter ||
                                 value.response?.providerMetadata?.openrouter ||
                                 {};

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
              // Actual cost from provider (OpenRouter returns this in providerMetadata)
              cost:
                toNum(providerMeta.cost) ??
                toNum(providerMeta.total_cost) ??
                toNum(usage.cost) ??
                toNum(usage.total_cost) ??
                toNum(value.cost),
            };
          };

          if (parsed.type === "text-delta" && typeof parsed.textDelta === "string") {
            fullContent += parsed.textDelta;

            // Real-time update: Update streaming store immediately for instant UI feedback
            appendStreamingContent(parsed.textDelta);

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
          if (parsed.type === "reasoning" && typeof parsed.textDelta === "string") {
            fullReasoning += parsed.textDelta;
            appendStreamingReasoning(parsed.textDelta);
          }

          if (parsed.type === "tool-call") {
            const now = Date.now();
            toolTimings[parsed.toolCallId] = { start: now };
            toolCalls.push({
              id: parsed.toolCallId,
              name: parsed.toolName,
              args: parsed.args,
              startTime: now, // Add start time
            });
            // Update streaming store for real-time UI
            setStreamingToolCalls([...toolCalls]);
            await updateMessage(assistantMessage.id, {
              toolCalls: [...toolCalls],
            });
          }

          if (parsed.type === "tool-result") {
            const now = Date.now();
            if (toolTimings[parsed.toolCallId]) {
              toolTimings[parsed.toolCallId].end = now;
            }
            toolResults.push({
              id: parsed.toolCallId,
              name: parsed.toolName,
              args: parsed.args,
              result: parsed.result,
              endTime: now, // Add end time
            });
            // Update streaming store for real-time UI
            setStreamingToolResults([...toolResults]);
            await updateMessage(assistantMessage.id, {
              toolResults: [...toolResults],
            });
          }

          // Extract token usage if available (format varies by provider/AI SDK version)
          // Prefer last-seen values (usage often arrives only at end).
          const u = extractUsage(parsed);
          if (typeof u.inTok === "number") inputTokens = u.inTok;
          if (typeof u.outTok === "number") outputTokens = u.outTok;
          if (typeof u.cost === "number") actualCost = u.cost;

          // Debug: Log any usage data we find
          if (u.inTok || u.outTok || u.cost) {
            console.log("[Chat] Stream usage data:", { inputTokens: u.inTok, outputTokens: u.outTok, cost: u.cost, raw: parsed });
          }

          // Log step-finish and finish events for debugging (these contain usage/cost)
          if (parsed.type === "step-finish" || parsed.type === "finish") {
            console.log(`[Chat] ${parsed.type} event:`, JSON.stringify(parsed, null, 2));
          }

          // Handle error events that can appear in the stream (from ai SDK v4)
          if (parsed.type === "error") {
            const errorMessage = parsed.error?.message || parsed.error?.data?.error?.message || "Stream error occurred";
            throw new Error(errorMessage);
          }
        } catch (e) {
          // If we threw an error above, re-throw it to the outer catch handler
          if (e instanceof Error && e.message !== "Failed to parse stream data") {
            throw e;
          }
          console.warn("Failed to parse stream data:", data);
        }
      }
    }

    // If provider didn't supply usage, fall back to local estimation so cost isn't stuck at 0.
    if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
      try {
        // llmMessages is the actual request payload we sent to the server.
        // Map it into Message-like objects so token-counter utilities can be reused.
        const approxInput = countMessagesTokens(
          llmMessages.map((m, idx) => ({
            id: `req_${idx}`,
            chatId,
            role: m.role,
            content: m.content as any,
            createdAt: Date.now(),
          }))
        );
        const approxOutput = countTokens(fullContent || "");
        inputTokens = typeof inputTokens === "number" ? inputTokens : approxInput;
        outputTokens = typeof outputTokens === "number" ? outputTokens : approxOutput;
        costIsEstimated = true;
      } catch {
        // If estimation fails for any reason, fall back to 0/0 (cost will be 0).
        inputTokens = inputTokens || 0;
        outputTokens = outputTokens || 0;
      }
    }

    // Use actual cost from provider if available, otherwise estimate
    let cost: number;
    console.log(`[Chat] Cost calculation - model: ${modelId}, provider: ${providerId}, actualCost: ${actualCost}, tokens: ${inputTokens}/${outputTokens}`);

    if (typeof actualCost === "number" && actualCost > 0) {
      cost = actualCost;
      costIsEstimated = false;
      console.log(`[Chat] Using actual cost from provider: $${cost.toFixed(6)}`);
    } else {
      cost = estimateCost(inputTokens || 0, outputTokens || 0, modelId, providerId);
      // costIsEstimated is already true if we fell back to local token counting
      console.log(`[Chat] Using estimated cost: $${cost.toFixed(6)} (model: ${modelId})`);
    }

    // Detect incomplete response (ends abruptly, no punctuation, or very long)
    const isIncomplete =
      fullContent.length > 0 &&
      (!/[.!?]$/.test(fullContent.trim()) || fullContent.length > 3000);

    // Update the assistant message with full content and metadata
    await updateMessage(assistantMessage.id, {
      content: fullContent,
      reasoning: fullReasoning || undefined,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      cost,
      costIsEstimated: costIsEstimated || undefined,
      isIncomplete,
      canContinue: isIncomplete,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    });

    // Update chat's total cost (activeBranchLeafId already set when assistant message was created)
    const currentTotalCost = chat.totalCost || 0;
    await updateChat(chatId, {
      totalCost: currentTotalCost + cost,
    });

    // Auto-generate title after the first exchange
    // We check if:
    // 1. The chat title is likely the default "New Chat" (we'll check the DB/cache state ideally, but here we can try)
    // 2. We just finished the first real assistant response (history length is small)
    if (chat.title === "New Chat" && history.length <= 1) { // history is PRE-current-generation, so 0 or 1 items usually
      // We can fire-and-forget this
      (async () => {
        try {
          console.log("[Chat] Auto-generating title...");

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

          console.log("[Chat] Using title model:", titleModelId);

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
            const { title, cost: titleCost } = await titleResponse.json();
            console.log("[Chat] Generated title:", title, titleCost ? `(cost: $${titleCost})` : "");
            if (title && title.length > 0) {
              // Add title generation cost to chat total
              const chatForCost = await getChatById(chatId);
              const newTotalCost = (chatForCost?.totalCost || 0) + (titleCost || 0);
              await updateChat(chatId, { title, totalCost: newTotalCost });
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
    const updatedMessages = await getMessages(chatId);
    if (updatedMessages.length > 0 && updatedMessages.length % 10 === 0) {
      // Map to ai Messages for the utility
      const aiMessages: Message[] = updatedMessages.map(m => ({
        id: m.id,
        role: m.role as any,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        createdAt: new Date(m.createdAt)
      }));
      generateAndApplySummary({ chatId, messages: aiMessages, keys }).catch(console.error);
    }
    } catch (error) {
      // Clear connection timeout on error
      clearTimeout(connectionTimeoutId);

      // Handle abort gracefully - don't show as error
      if (error instanceof Error && error.name === "AbortError") {
        // Check if it was a timeout vs user cancellation
        const isTimeout = !fullContent && abortControllerRef.current === null;
        // Update message to show it was cancelled or timed out
        await updateMessage(assistantMessage.id, {
          content: fullContent || (isTimeout ? "⏱️ Connection timed out. Please try again." : "⏹️ Request cancelled"),
          isIncomplete: !!fullContent,
          canContinue: false,
        });
        return; // Don't re-throw for cancelled requests
      }
      // Update the assistant message with the error so it's visible in the chat
      const errorText = error instanceof Error ? error.message : "An error occurred";
      await updateMessage(assistantMessage.id, {
        content: `❌ ${errorText}`,
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
        clearStreaming();
        streamingClearTimeoutRef.current = null;
      }, 150);

      // Refresh memory cache in background for next interaction
      // This keeps memories fresh without blocking the current response
      refreshCacheInBackground(userMessageText);
    }
  }, [chatId, getKeyForProvider, keys, scheduleMemoryExtraction, setStreamingMessage, appendStreamingContent, appendStreamingReasoning, setStreamingToolCalls, setStreamingToolResults, clearStreaming, startPipeline, setStepRunning, setStepComplete, setStepError, completePipeline, failPipeline, clearPipeline, setActiveSkill]);

  const sendMessage = async (content: MessageContent, attachments?: Array<{ name: string; content: string }>, selectedSkill?: Skill | null) => {
    setIsLoading(true);
    setError(null);

    // Show optimistic user message immediately for instant feedback
    const optimisticId = `optimistic-${Date.now()}`;
    setOptimisticMessage({
      id: optimisticId,
      content,
      role: "user",
      createdAt: Date.now(),
      status: "sending",
    });

    try {
      let chat = await getChatById(chatId);
      if (!chat) throw new Error("Chat not found");

      // Check for @agent mention - if found, switch to that agent
      const messageText = getTextFromMessageContent(content);
      const agentMentionMatch = messageText.match(/@agent:([^\[]+)\[([^\]]+)\]/);
      if (agentMentionMatch) {
        const mentionedAgentId = agentMentionMatch[1];
        const mentionedAgent = await getAgentById(mentionedAgentId);
        if (mentionedAgent) {
          // Update optimistic message to show agent switching
          setOptimisticMessage({
            id: optimisticId,
            content,
            role: "user",
            createdAt: Date.now(),
            status: "switching-agent",
            agentName: mentionedAgent.name,
          });

          // Switch the chat to use the mentioned agent
          await updateChat(chatId, {
            agentId: mentionedAgent.id,
            modelId: mentionedAgent.modelId || chat.modelId,
            activeMcpServerIds: mentionedAgent.mcpServerIds || [],
          });
          // Refresh chat data after update
          chat = await getChatById(chatId);
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
          throw new Error(`Current model (${modelId}) does not support images.`);
        }
      }

      const parentId = chat.activeBranchLeafId || (await getLastMessage(chatId))?.id;

      // Add user message to database with original content
      const userMessage = await addMessage({
        chatId,
        role: "user",
        content,
        parentId,
      });

      // Clear optimistic message now that real message is saved
      clearOptimisticMessage();

      // Update chat's updatedAt timestamp
      await updateChat(chatId, { activeBranchLeafId: userMessage.id });

      // Auto-detect skill if none selected
      let activeSkill: Skill | null = selectedSkill || null;
      if (!activeSkill) {
        try {
          const settings = await getSettings();
          const embeddingsProvider = settings?.embeddingsProvider;
          const embeddingsModelId = settings?.embeddingsModelId;

          const threshold = settings?.skillMatchThreshold ?? 0.5;

          console.log("[Chat] Skill auto-detection check:", {
            hasSelectedSkill: !!selectedSkill,
            embeddingsProvider,
            embeddingsModelId,
            threshold,
          });

          if (embeddingsProvider && embeddingsModelId) {
            const embeddingsApiKey = getKeyForProvider(embeddingsProvider);
            console.log("[Chat] Embeddings API key found:", !!embeddingsApiKey?.key);

            if (embeddingsApiKey?.key) {
              console.log("[Chat] Attempting auto skill detection for message:", messageText.slice(0, 100));
              const matchResult = await matchSkill(
                messageText,
                embeddingsApiKey.key,
                {
                  providerId: embeddingsProvider,
                  modelId: embeddingsModelId,
                  threshold,
                  excludeManualOnly: true // Only match auto-trigger skills
                }
              );
              console.log("[Chat] matchSkill result:", matchResult ? { name: matchResult.skill.name, similarity: matchResult.similarity } : null);
              if (matchResult) {
                activeSkill = matchResult.skill;
                console.log(`[Chat] Auto-detected skill: ${matchResult.skill.name} (${(matchResult.similarity * 100).toFixed(1)}%)`);
              } else {
                console.log("[Chat] No skill matched above threshold");
              }
            } else {
              console.log("[Chat] No API key for embeddings provider:", embeddingsProvider);
            }
          } else {
            console.log("[Chat] Embeddings not configured - skipping skill auto-detection");
          }
        } catch (err) {
          // Don't fail the message send if skill detection fails
          console.warn("[Chat] Skill auto-detection failed:", err);
        }
      }

      if (isArenaMode && arenaModelIds.length > 0) {
        // Use allSettled so one model failure doesn't abort the others
        const results = await Promise.allSettled(
          arenaModelIds.map(modelId => generateResponse(content, attachments, modelId, userMessage.id, activeSkill))
        );
        // Report individual failures without throwing (so the hook doesn't go into error state)
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === "rejected") {
            const modelId = arenaModelIds[i];
            const errorMessage = result.reason instanceof Error ? result.reason.message : "Unknown error";
            toast.error(`Arena: ${modelId} failed - ${errorMessage}`);
          }
        }
      } else {
        await generateResponse(content, attachments, undefined, userMessage.id, activeSkill);
      }

    } catch (err) {
      handleError(err);
      // Ensure all state is cleared on error
      clearStreaming();
      clearPipeline();
      clearOptimisticMessage();
    } finally {
      setIsLoading(false);
    }
  };

  const editMessage = async (messageId: string, newContent: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const message = await getMessageById(messageId);
      if (!message || message.chatId !== chatId) throw new Error("Message not found");
      if (message.role !== "user") throw new Error("Only user messages can be edited");

      // Create a new branch user message (sibling) instead of overwriting history.
      const branchedUser = await addMessage({
        chatId,
        role: "user",
        content: newContent,
        parentId: message.parentId,
      });

      const hasBranches = await chatHasBranches(chatId);
      await updateChat(chatId, {
        activeBranchLeafId: branchedUser.id,
        hasBranches,
      });

      await generateResponse(newContent, undefined, undefined, branchedUser.id);

    } catch (err) {
      handleError(err);
      clearStreaming();
      clearPipeline();
    } finally {
      setIsLoading(false);
    }
  };

  const continueResponse = async (messageId: string) => {
    setIsLoading(true);
    setError(null);
    setContinuingMessageId(messageId);

    try {
      const message = await getMessageById(messageId);
      if (!message || message.chatId !== chatId) throw new Error("Message not found");

      const continuePrompt = "Please continue your previous response.";
      const continueUser = await addMessage({
        chatId,
        role: "user",
        content: continuePrompt,
        parentId: messageId,
      });
      await updateChat(chatId, { activeBranchLeafId: continueUser.id });

      await updateMessage(messageId, { canContinue: false });
      await generateResponse(continuePrompt, undefined, undefined, continueUser.id);

    } catch (err) {
      handleError(err);
      clearStreaming();
      clearPipeline();
    } finally {
      setIsLoading(false);
      setContinuingMessageId(null);
    }
  };

  const regenerateAssistant = async (assistantMessageId: string) => {
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

      const hasBranches = await chatHasBranches(chatId);
      await updateChat(chatId, { activeBranchLeafId: assistant.parentId, hasBranches });
      await generateResponse(parentUser.content, undefined, undefined, parentUser.id);
    } catch (err) {
      handleError(err);
      clearStreaming();
      clearPipeline();
    } finally {
      setIsLoading(false);
    }
  };

  const resendMessage = async (userMessageId: string) => {
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
      clearStreaming();
      clearPipeline();
    } finally {
      setIsLoading(false);
    }
  };

  const handleError = (err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : "An error occurred";
    setError(errorMessage);
    // Log as warning to avoid triggering Next.js error overlay in dev mode
    console.warn("[Chat Error]", errorMessage);
    toast.error(errorMessage);
  };

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      clearStreaming();
    }
  }, [clearStreaming]);

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
