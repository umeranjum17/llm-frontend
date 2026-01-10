import { useState, useCallback, useEffect, useRef } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { pickBestProviderId } from "@/lib/ai/provider-routing";
import { db } from "@/lib/db/schema";
import { updateChat } from "@/lib/db/queries";
import { toast } from "sonner";

export function useChatSummary(
    chatId?: string,
    messages: any[] = [],
    existingSummary?: string,
    enabled: boolean = true
) {
    const [isGenerating, setIsGenerating] = useState(false);
    const keys = useApiKeysStore((s) => s.keys);
    const generatedRef = useRef(false);

    const generateSummary = useCallback(async (targetChatId: string, msgs: any[]) => {
        setIsGenerating(true);
        try {
            const chat = await db.chats.get(targetChatId);
            if (!chat) throw new Error("Chat not found");

            // Resolve providerId
            const availableProviderIds = keys.map((k) => k.provider);
            const providerId = chat.providerId || pickBestProviderId({
                modelId: chat.modelId,
                availableProviderIds,
            });

            // Get API key
            const apiKeyEntry = keys.find((k) => k.provider === providerId);
            const apiKey = apiKeyEntry?.key;

            if (!apiKey) {
                console.log(`[AutoSummary] No API key found for ${providerId}. Skipping.`);
                return;
            }

            const response = await fetch("/api/chat/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: msgs,
                    providerId,
                    modelId: chat.modelId,
                    apiKey,
                    providerBaseUrl: apiKeyEntry?.baseUrl,
                }),
            });

            if (!response.ok) {
                throw new Error(`Summary API failed: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            if (data.summary) {
                await updateChat(targetChatId, { summary: data.summary });

                // Only show toast if explicitly triggered (manual), otherwise silent
                if (!generatedRef.current) {
                    // Logic for manual trigger feedback could be handled by caller or state
                    // But here we might be reusing this function.
                }
            }
        } catch (error: any) {
            console.error("Summarization error:", error);
        } finally {
            setIsGenerating(false);
        }
    }, [keys]);

    // Auto-summarization effect
    useEffect(() => {
        if (
            !enabled ||
            !chatId ||
            generatedRef.current ||
            existingSummary ||
            messages.length < 10 // Trigger after 10 messages
        ) {
            return;
        }

        const timer = setTimeout(() => {
            console.log("[AutoSummary] Triggering for chat", chatId);
            generatedRef.current = true;
            generateSummary(chatId, messages);
        }, 5000); // 5s debounce/delay

        return () => clearTimeout(timer);
    }, [chatId, messages.length, existingSummary, enabled, generateSummary]);

    return {
        generateSummary,
        isGenerating
    };
}
