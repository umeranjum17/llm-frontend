import { updateChat } from "@/lib/db/queries";
import { pickBestProviderId } from "@/lib/ai/provider-routing";
import { db } from "@/lib/db/schema";
import type { ApiKey } from "@/lib/db/schema";
import type { UIMessage } from "ai";

export interface SummarizeOptions {
    chatId: string;
    messages: UIMessage[];
    keys: ApiKey[];
}

export async function generateAndApplySummary({ chatId, messages, keys }: SummarizeOptions) {
    try {
        const chat = await db.chats.get(chatId);
        if (!chat) {
            return null;
        }

        // Resolve providerId
        const availableProviderIds = keys.map((k) => k.provider);
        const providerId = chat.providerId || pickBestProviderId({
            modelId: chat.modelId,
            availableProviderIds,
        });

        // Get API key for the chat's provider
        const apiKeyEntry = keys.find((k) => k.provider === providerId);
        const apiKey = apiKeyEntry?.key;

        if (!apiKey) {
            return null;
        }

        const response = await fetch("/api/chat/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: messages.slice(-10), // Send last 10 messages
                providerId,
                modelId: chat.modelId,
                apiKey,
                providerBaseUrl: apiKeyEntry?.baseUrl,
            }),
        });

        if (!response.ok) {
            console.error("[AutoSummary] API error:", response.status);
            return null;
        }

        const { summary, cost: summaryCost } = await response.json();

        if (summary) {
            // Add summarization cost to chat total
            const currentChat = await db.chats.get(chatId);
            const newTotalCost = (currentChat?.totalCost || 0) + (summaryCost || 0);
            await updateChat(chatId, { summary, totalCost: newTotalCost });
        }

        return summary;
    } catch (error) {
        console.error("Auto-summarization error:", error);
        return null;
    }
}
