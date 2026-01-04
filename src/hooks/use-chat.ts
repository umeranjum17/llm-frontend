import { useState, useCallback } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useUIStore } from "@/stores/ui-store";
import { addMessage, updateChat, getChatById, updateMessage, deleteMessagesAfter, getMessages } from "@/lib/db/queries";
import { buildContextMessages } from "@/lib/ai/context-builder";
import { estimateCost } from "@/lib/utils/token-counter";
import { toast } from "sonner";

function cleanReferencesForLLM(content: string) {
  return content
    .replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]")
    .replace(/@chat:[^\[]+\[([^\]]+)\]/g, "[$1]");
}

export function useChat(chatId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const { getKeyForProvider } = useApiKeysStore();
  const { isArenaMode, arenaModelIds } = useUIStore();

  const generateResponse = useCallback(async (
    messageContent: string,
    attachments?: Array<{ name: string; content: string }>,
    overrideModelId?: string
  ) => {
    // Get API key
    const apiKey = getKeyForProvider("openrouter");
    if (!apiKey) {
      throw new Error("No API key found. Please add an OpenRouter API key.");
    }

    // Get chat details for model info
    const chat = await getChatById(chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const modelId = overrideModelId || chat.modelId;
    const enabledTools = chat.enabledTools || [];
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

    const contextMessages = await buildContextMessages(messageContent, chatId);
    const history = await getMessages(chatId);

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
          content: m.role === "user" ? cleanReferencesForLLM(m.content) : m.content,
        })),
    ];

    // Add empty assistant message that we'll update during streaming
    const assistantMessage = await addMessage({
      chatId,
      role: "assistant",
      content: "",
      modelId,
      isArena: !!overrideModelId,
    });

    // Call API route for streaming
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey.key,
      },
      body: JSON.stringify({
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
    });
  }, [chatId, getKeyForProvider]);

  const sendMessage = async (content: string, attachments?: Array<{ name: string; content: string }>) => {
    setIsLoading(true);
    setError(null);

    try {
      // Add user message to database with original content
      await addMessage({
        chatId,
        role: "user",
        content,
      });

      // Update chat's updatedAt timestamp
      await updateChat(chatId, {});

      if (isArenaMode && arenaModelIds.length > 0) {
        await Promise.all(
          arenaModelIds.map(modelId => generateResponse(content, attachments, modelId))
        );
      } else {
        await generateResponse(content, attachments);
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
      // Get message to verify existence and timestamp
      const messages = await getMessages(chatId);
      const message = messages.find(m => m.id === messageId);

      if (!message) throw new Error("Message not found");

      // Update message content
      await updateMessage(messageId, { content: newContent });

      // Delete all messages AFTER this one
      await deleteMessagesAfter(chatId, message.createdAt);

      // Update chat timestamp
      await updateChat(chatId, {});

      // Regenerate response
      await generateResponse(newContent);

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
      // ... existing continue logic (can be refactored later if needed, but keeping as is for safety) ...
      // (Copying existing implementation for now to minimize risk, but simplified)
      // Actually, for brevity, I will keep the original implementation via "Wait, I should probably reuse generateResponse but continue has simpler logic"
      // Re-implementing continueResponse with similar logic to original file to match expectations

      // Get the message to continue
      const messages = await getMessages(chatId);
      if (!messages.some((m) => m.id === messageId)) {
        throw new Error("Message not found");
      }

      const continuePrompt = "Please continue your previous response.";
      await addMessage({
        chatId,
        role: "user",
        content: continuePrompt,
      });
      await updateChat(chatId, {});

      await updateMessage(messageId, { canContinue: false });
      await generateResponse(continuePrompt);

    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
      setContinuingMessageId(null);
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
    isLoading,
    error,
    continuingMessageId,
  };
}
