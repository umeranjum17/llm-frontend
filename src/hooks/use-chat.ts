import { useState, useCallback } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useUIStore } from "@/stores/ui-store";
import { addMessage, updateChat, getChatById, updateMessage, getMessagesForBranch, getLastMessage, getMessageById, chatHasBranches, incrementAgentUsage } from "@/lib/db/queries";
import { buildContextMessages } from "@/lib/ai/context-builder";
import { estimateCost } from "@/lib/utils/token-counter";
import type { MessageContent } from "@/lib/db/schema";
import { getImagesFromMessageContent, getTextFromMessageContent, mapTextInMessageContent } from "@/lib/utils/message-content";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { toast } from "sonner";
import { pickBestProviderId, providerLabel } from "@/lib/ai/provider-routing";

function cleanReferencesForLLM(content: string) {
  return content
    .replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]")
    .replace(/@chat:[^\[]+\[([^\]]+)\]/g, "[$1]");
}

export function useChat(chatId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const { keys, getKeyForProvider } = useApiKeysStore();
  const { isArenaMode, arenaModelIds } = useUIStore();

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
      (chat.providerId && llmProviderIds.includes(chat.providerId) ? chat.providerId : null) ||
      pickBestProviderId({
        modelId,
        availableProviderIds: llmProviderIds,
      });

    if (!providerId) {
      throw new Error("No provider configured. Add an API key (or local provider) in Settings.");
    }

    const apiKey = getKeyForProvider(providerId);
    const providerKeyRequired = !["ollama", "lmstudio"].includes(providerId);
    if (providerKeyRequired && !apiKey) {
      throw new Error(`Missing API key for ${providerLabel(providerId)}.`);
    }

    const enabledTools = chat.enabledTools || [];
    const images = getImagesFromMessageContent(messageContent);
    if (images.length > 0 && !getModelCapabilities(modelId).supportsVision) {
      throw new Error(`Selected model (${modelId}) does not support images.`);
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
        } catch (e) {
          // Skip invalid JSON
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
  }, [chatId, getKeyForProvider, keys]);

  const sendMessage = async (content: MessageContent, attachments?: Array<{ name: string; content: string }>) => {
    setIsLoading(true);
    setError(null);

    try {
      const chat = await getChatById(chatId);
      if (!chat) throw new Error("Chat not found");
      if (chat.agentId) {
        incrementAgentUsage(chat.agentId).catch(() => {});
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
        await Promise.all(
          arenaModelIds.map(modelId => generateResponse(content, attachments, modelId, userMessage.id))
        );
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
