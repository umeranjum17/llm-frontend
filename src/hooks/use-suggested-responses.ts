"use client";

import { useState, useCallback, useEffect } from "react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { pickBestProviderId } from "@/lib/ai/provider-routing";
import { db } from "@/lib/db/schema";
import { toast } from "@/hooks/use-toast";
import type { UIMessage } from "ai";
import type { APIErrorCode } from "@/lib/utils/api-error-response";

// Track last shown error to prevent toast spam
let lastApiKeyErrorTimestamp = 0;
const API_KEY_ERROR_COOLDOWN_MS = 60_000; // Only show once per minute

export function useSuggestedResponses(
    chatId?: string,
    messages: any[] = [],
    enabled: boolean = true
) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const keys = useApiKeysStore((s) => s.keys);

    const fetchSuggestions = useCallback(async (targetChatId: string, msgs: any[]) => {
        setIsLoading(true);
        try {
            const chat = await db.chats.get(targetChatId);
            if (!chat) return;

            const availableProviderIds = keys.map((k) => k.provider);
            const providerId = chat.providerId || pickBestProviderId({
                modelId: chat.modelId,
                availableProviderIds,
            });

            const apiKeyEntry = keys.find((k) => k.provider === providerId);
            const apiKey = apiKeyEntry?.key;

            if (!apiKey) return;

            const response = await fetch("/api/chat/suggested", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: msgs.slice(-5), // Last 5 messages for context
                    providerId,
                    modelId: chat.modelId,
                    apiKey,
                    providerBaseUrl: apiKeyEntry?.baseUrl,
                }),
            });

            if (!response.ok) throw new Error("API failed");

            const data = await response.json();

            // Check for API key errors and surface them to the user (with cooldown to prevent spam)
            if (data.errorCode && (data.errorCode === "API_KEY_INVALID" || data.errorCode === "API_KEY_MISSING")) {
                const now = Date.now();
                if (now - lastApiKeyErrorTimestamp > API_KEY_ERROR_COOLDOWN_MS) {
                    lastApiKeyErrorTimestamp = now;
                    toast({
                        title: "API Key Error",
                        description: data.error || `There's an issue with your ${data.provider || "API"} key. Please check your settings.`,
                        variant: "destructive",
                    });
                }
            }

            if (data.suggestions) {
                setSuggestions(data.suggestions);
            }
        } catch (error) {
            console.error("Failed to fetch suggestions:", error);
        } finally {
            setIsLoading(false);
        }
    }, [keys]);

    useEffect(() => {
        if (!enabled || !chatId || messages.length === 0) {
            setSuggestions([]);
            return;
        }

        const lastMessage = messages[messages.length - 1];

        // Only trigger if the last message is from the assistant and it's not currently streaming
        // We check if content changed and last role is assistant
        if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string" && lastMessage.content.length > 0) {
            const timer = setTimeout(() => {
                fetchSuggestions(chatId, messages);
            }, 1500); // Small delay to ensure streaming is really done
            return () => clearTimeout(timer);
        } else {
            setSuggestions([]);
        }
    }, [chatId, messages.length, enabled, fetchSuggestions]);

    return { suggestions, isLoading, setSuggestions };
}
