import { useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useApiKeysStore } from "@/stores/api-keys-store";
import type { Message } from "ai";
import { createTag, getAllTags, updateChat } from "@/lib/db/queries";
import { pickBestProviderId } from "@/lib/ai/provider-routing";
import { db } from "@/lib/db/schema";

export function useAutoTags(
    chatId: string,
    messages: Message[],
    tags: string[] = [],
    enabled: boolean = true
) {
    const generatedRef = useRef(false);
    const keys = useApiKeysStore((s) => s.keys);

    useEffect(() => {
        // Conditions to trigger auto-tagging:
        // 1. Enabled
        // 2. Not already generated this session (ref)
        // 3. No existing tags (we only auto-tag new conversations)
        // 4. Sufficient message history (at least 3 messages)
        if (
            !enabled ||
            generatedRef.current ||
            (tags && tags.length > 0) ||
            messages.length < 3
        ) {
            return;
        }

        const generateTags = async () => {
            console.log("[AutoTags] potentially triggering...");
            generatedRef.current = true; // Mark as started to prevent duplicates

            try {
                const chat = await db.chats.get(chatId);
                if (!chat) {
                    console.log("[AutoTags] Chat not found in DB");
                    return;
                }

                // Resolve providerId similarly to useChat
                const availableProviderIds = keys.map((k) => k.provider);
                const providerId = chat.providerId || pickBestProviderId({
                    modelId: chat.modelId,
                    availableProviderIds,
                });

                // Get API key for the chat's provider
                const apiKeyEntry = keys.find((k) => k.provider === providerId);
                const apiKey = apiKeyEntry?.key;

                if (!apiKey) {
                    console.log(`[AutoTags] No API key found for provider ${providerId} (model: ${chat.modelId}). Skipping.`);
                    return;
                }

                console.log("[AutoTags] Fetching tags from API...");
                const response = await fetch("/api/tags/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: messages.slice(0, 5), // Send first few messages
                        providerId,
                        modelId: chat.modelId,
                        apiKey,
                        providerBaseUrl: apiKeyEntry?.baseUrl, // Pass custom base URL if needed
                    }),
                });

                if (!response.ok) {
                    console.error("[AutoTags] API error:", response.status);
                    return;
                }

                const { tags: newTagNames } = await response.json();
                console.log("[AutoTags] Received tags:", newTagNames);

                if (!newTagNames || !Array.isArray(newTagNames) || newTagNames.length === 0) return;

                // Process tags: find existing or create new
                const existingTags = await getAllTags();
                const tagIds = [];

                for (const tagName of newTagNames) {
                    const lowerName = tagName.toLowerCase().trim();
                    let tag = existingTags.find((t) => t.name.toLowerCase() === lowerName);

                    if (!tag) {
                        // Create new tag
                        // Assign a random color
                        const colors = ["red", "orange", "yellow", "green", "blue", "indigo", "purple", "pink"];
                        const randomColor = colors[Math.floor(Math.random() * colors.length)];

                        tag = await createTag({
                            name: lowerName,
                            color: randomColor,
                            description: "Auto-generated",
                        });
                    }

                    if (tag) tagIds.push(tag.id);
                }

                // Update chat with new tags
                if (tagIds.length > 0) {
                    console.log("[AutoTags] Updating chat with tags:", tagIds);
                    await updateChat(chatId, { tags: tagIds });
                }
            } catch (error) {
                console.error("Auto-tagging error:", error);
            }
        };

        // Debounce slightly to ensure we don't trigger mid-stream too early
        const timer = setTimeout(generateTags, 2000);
        return () => clearTimeout(timer);
    }, [chatId, messages.length, tags, enabled, keys]);
}
