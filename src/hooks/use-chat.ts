import { useState, useCallback, useRef, useEffect } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useUIStore } from "@/stores/ui-store";
import { addMessage, updateChat, getChatById, updateMessage, getMessagesForBranch, getLastMessage, getMessageById, chatHasBranches, incrementAgentUsage, getMessages, getEnabledMcpServers } from "@/lib/db/queries";
import { buildContextMessages } from "@/lib/ai/context-builder";
import { estimateCost } from "@/lib/utils/token-counter";
import type { MessageContent } from "@/lib/db/schema";
import { getImagesFromMessageContent, getTextFromMessageContent, mapTextInMessageContent } from "@/lib/utils/message-content";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { toast } from "sonner";
import { isModelIdCompatibleWithProviderId, pickBestProviderId, providerLabel } from "@/lib/ai/provider-routing";
import { addMemory, searchMemories } from "@/lib/memory";
import { generateAndApplySummary } from "@/lib/ai/summarization";
import { getSettings } from "@/lib/db/queries";
import type { Message } from "ai";

function cleanReferencesForLLM(content: string) {
  return content
    .replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]")
    .replace(/@chat:[^\[]+\[([^\]]+)\]/g, "[$1]");
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
  parentUserMessageId?: string
): Promise<void> {
  const { addMessage, updateMessage, updateChat, getChatById } = await import("@/lib/db/queries");

  // Create assistant message placeholder
  const assistantMessage = await addMessage({
    chatId,
    role: "assistant",
    content: [{ type: "text", text: "🎨 Generating image..." }],
    modelId,
    parentId: parentUserMessageId,
  });

  try {
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
        prompt,
        size: "1024x1024",
        quality: "standard",
      }),
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

    // Update chat's activeBranchLeafId
    const chat = await getChatById(chatId);
    if (chat) {
      await updateChat(chatId, {
        activeBranchLeafId: assistantMessage.id,
      });
    }
  } catch (error) {
    // Update message with error
    const errorText = error instanceof Error ? error.message : "Image generation failed";
    await updateMessage(assistantMessage.id, {
      content: `❌ ${errorText}`,
    });
    throw error;
  }
}

export function useChat(chatId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const { keys, getKeyForProvider } = useApiKeysStore();
  const { isArenaMode, arenaModelIds } = useUIStore();
  const extractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          // Get last exchange (User + Assistant)
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
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current);
      }
    };
  }, [chatId]);

  const generateResponse = useCallback(async (
    messageContent: MessageContent,
    attachments?: Array<{ name: string; content: string }>,
    overrideModelId?: string,
    parentUserMessageId?: string
  ) => {
    // Get chat details for model info
    const chat = await getChatById(chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

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

    // Check if this is an image generation model
    if (modelCaps.isImageGeneration) {
      return await handleImageGeneration(
        chatId,
        modelId,
        providerId,
        apiKey,
        getTextFromMessageContent(messageContent),
        parentUserMessageId
      );
    }

    const webSearchConfig = (() => {
      if (!enabledTools.includes("web-search")) return undefined;

      const tavilyKey = getKeyForProvider("tavily")?.key;
      if (tavilyKey) return { provider: "tavily" as const, apiKey: tavilyKey };

      const serperKey = getKeyForProvider("serper")?.key;
      if (serperKey) return { provider: "serper" as const, apiKey: serperKey };

      const braveKey = getKeyForProvider("brave")?.key;
      if (braveKey) return { provider: "brave" as const, apiKey: braveKey };

      const searxngBaseUrl = getKeyForProvider("searxng")?.key;
      if (searxngBaseUrl) return { provider: "searxng" as const, baseUrl: searxngBaseUrl };

      return undefined;
    })();

    const contextMessages = await buildContextMessages(
      getTextFromMessageContent(messageContent),
      chatId
    );

    // Retrieve Memories from Mem0
    const userQuery = getTextFromMessageContent(messageContent);
    const settings = await getSettings();
    let relevantMemories = "";

    if (settings?.memoryEnabled) {
      try {
        const memories = await searchMemories(userQuery);
        if (memories && memories.length > 0) {
          const facts = memories.map((m: any) => ` - ${m.memory}`).join("\n");
          relevantMemories = `\nActive Memories:\n${facts}\n`;
          console.log("[Chat] Injected memories:", memories.length);
        }
      } catch (err) {
        console.error("[Chat] Failed to search memories:", err);
      }
    }
    const history = await getMessagesForBranch(chatId, parentUserMessageId);

    const llmMessages = [
      ...contextMessages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content + (m.role === "system" ? relevantMemories : ""), // Inject memories into system prompt if possible, or append to context
      })),
      ...(attachments || []).map((file) => ({
        role: "system" as const,
        content: `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\``,
      })),
      ...history
        .filter(
          (m) => m.role === "system" || m.role === "user" || m.role === "assistant"
        )
        .map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content:
            m.role === "user"
              ? mapTextInMessageContent(m.content, cleanReferencesForLLM)
              : m.content,
        })),
    ];

    // Add empty assistant message that we'll update during streaming
    const assistantMessage = await addMessage({
      chatId,
      role: "assistant",
      content: "",
      modelId,
      isArena: !!overrideModelId,
      parentId: parentUserMessageId,
    });

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
        webSearch: webSearchConfig,
        mcpServers: await getEnabledMcpServers(),
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    // Handle streaming response with real-time updates
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

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
          if (parsed.type === "text-delta" && typeof parsed.textDelta === "string") {
            fullContent += parsed.textDelta;

            // Real-time update: Update message in database immediately
            await updateMessage(assistantMessage.id, {
              content: fullContent,
            });
          }

          if (parsed.type === "tool-call") {
            toolCalls.push({
              id: parsed.toolCallId,
              name: parsed.toolName,
              args: parsed.args,
            });
            await updateMessage(assistantMessage.id, {
              toolCalls: [...toolCalls],
            });
          }

          if (parsed.type === "tool-result") {
            toolResults.push({
              id: parsed.toolCallId,
              name: parsed.toolName,
              args: parsed.args,
              result: parsed.result,
            });
            await updateMessage(assistantMessage.id, {
              toolResults: [...toolResults],
            });
          }

          // Extract token usage if available (usually on finish/step-finish)
          if (
            parsed.usage &&
            typeof parsed.usage.promptTokens === "number" &&
            typeof parsed.usage.completionTokens === "number"
          ) {
            inputTokens = parsed.usage.promptTokens;
            outputTokens = parsed.usage.completionTokens;
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

    // Calculate cost
    const cost = estimateCost(inputTokens || 0, outputTokens || 0, chat.modelId);

    // Detect incomplete response (ends abruptly, no punctuation, or very long)
    const isIncomplete =
      fullContent.length > 0 &&
      (!/[.!?]$/.test(fullContent.trim()) || fullContent.length > 3000);

    // Update the assistant message with full content and metadata
    await updateMessage(assistantMessage.id, {
      content: fullContent,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      cost,
      isIncomplete,
      canContinue: isIncomplete,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    });

    // Update chat's total cost
    const currentTotalCost = chat.totalCost || 0;
    await updateChat(chatId, {
      totalCost: currentTotalCost + cost,
      activeBranchLeafId: assistantMessage.id,
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
            const { title } = await titleResponse.json();
            console.log("[Chat] Generated title:", title);
            if (title && title.length > 0) {
              await updateChat(chatId, { title });
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
  }, [chatId, getKeyForProvider, keys, scheduleMemoryExtraction]);

  const sendMessage = async (content: MessageContent, attachments?: Array<{ name: string; content: string }>) => {
    setIsLoading(true);
    setError(null);

    try {
      const chat = await getChatById(chatId);
      if (!chat) throw new Error("Chat not found");
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

      // Update chat's updatedAt timestamp
      await updateChat(chatId, { activeBranchLeafId: userMessage.id });

      if (isArenaMode && arenaModelIds.length > 0) {
        // Use allSettled so one model failure doesn't abort the others
        const results = await Promise.allSettled(
          arenaModelIds.map(modelId => generateResponse(content, attachments, modelId, userMessage.id))
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
        await generateResponse(content, attachments, undefined, userMessage.id);
      }

    } catch (err) {
      handleError(err);
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleError = (err: any) => {
    const errorMessage = err instanceof Error ? err.message : "An error occurred";
    setError(errorMessage);
    console.error(err);
    toast.error(errorMessage);
  };

  return {
    sendMessage,
    editMessage,
    continueResponse,
    regenerateAssistant,
    isLoading,
    error,
    continuingMessageId,
  };
}
