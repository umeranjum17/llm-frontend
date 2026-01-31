import { createTag, getAllTags, updateChat, getMessages } from "@/lib/db/queries";
import { pickBestProviderId } from "@/lib/ai/provider-routing";
import { db } from "@/lib/db/schema";
import type { ApiKey, Tag, Message } from "@/lib/db/schema";
import type { UIMessage } from "ai";

export interface TaggingOptions {
    chatId: string;
    messages: UIMessage[];
    keys: ApiKey[];
}

export async function generateAndApplyTags({ chatId, messages, keys }: TaggingOptions) {
    try {
        const chat = await db.chats.get(chatId);
        if (!chat) {
            return [];
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
            return [];
        }

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
            return [];
        }

        const { tags: newTagNames } = await response.json();

        if (!newTagNames || !Array.isArray(newTagNames) || newTagNames.length === 0) return [];

        // Process tags: find existing or create new
        const existingTags = await getAllTags();
        const tagIds = [];

        for (const tagName of newTagNames) {
            const lowerName = tagName.toLowerCase().trim();
            let tag: Tag | undefined = existingTags.find((t: Tag) => t.name.toLowerCase() === lowerName);

            if (!tag) {
                // Create new tag
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
            await updateChat(chatId, { tags: tagIds });
        }

        return newTagNames;
    } catch (error) {
        console.error("Auto-tagging error:", error);
        return [];
    }
}

export async function triggerBatchAutoTagging(keys: ApiKey[]) {
    const chats = await db.chats.toArray();
    const untaggedChats = chats.filter(chat => !chat.tags || chat.tags.length === 0);


    let successCount = 0;
    for (const chat of untaggedChats) {
        const messages = await getMessages(chat.id);
        if (messages.length >= 3) {
            // Map db messages to ai UIMessages (v6 requires parts array)
            const aiMessages: UIMessage[] = messages.map((m: Message) => ({
                id: m.id,
                role: m.role as any,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                createdAt: new Date(m.createdAt),
                parts: [{ type: 'text' as const, text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
            }));
            const tags = await generateAndApplyTags({ chatId: chat.id, messages: aiMessages, keys });
            if (tags.length > 0) successCount++;
        }
    }

    return successCount;
}
