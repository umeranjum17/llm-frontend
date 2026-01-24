import { useState, useCallback, useEffect, useRef } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { pickBestProviderId } from "@/lib/ai/provider-routing";
import { db } from "@/lib/db/schema";
import { updateChat } from "@/lib/db/queries";
import { toast } from "sonner";
import { getErrorMessage, type APIErrorResponse } from "@/lib/utils/error-messages";

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

            const data = await response.json() as { summary?: string } & Partial<APIErrorResponse>;

            // Handle structured error responses (returned as 200 for graceful degradation)
            if (data.errorCode && data.errorCode !== "API_KEY_MISSING") {
                // Show toast for unexpected errors (not missing key, which is expected)
                const context: Record<string, string> = {};
                if (data.provider) context.provider = data.provider;
                const actionable = getErrorMessage(data.errorCode as any, context);
                console.warn("Summary generation error:", data.error, { errorCode: data.errorCode });
                toast.error(actionable.title, { description: actionable.description });
            }

            if (data.summary) {
                await updateChat(targetChatId, { summary: data.summary });
            }
        } catch (error: any) {
            console.error("Summarization error:", error);
            // Only show toast for network/unexpected errors
            toast.error("Summary generation failed", { description: "Check your connection and try again." });
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
