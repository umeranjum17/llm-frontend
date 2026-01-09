import { getSettings } from "@/lib/db/queries";
import { addMemory } from "./memory-store";
import type { Message, UserMemory } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { db } from "@/lib/db/schema";
import { pickBestProviderId } from "@/lib/ai/provider-routing";
import { toast } from "sonner";

const EXTRACTION_PROMPT = `Analyze this conversation and extract key facts about the user that would be useful to remember for future conversations.

IMPORTANT RULES:
- Only extract CLEAR, FACTUAL information directly stated or strongly implied
- Do NOT make assumptions or inferences beyond what's stated
- Focus on stable, long-term information (not temporary situations)
- Avoid extracting sensitive information (passwords, financial details, etc.)

What to extract:
- User's name, profession, or role
- Technical skills and expertise areas
- Current projects or companies they work with
- Communication preferences and style
- Tools, languages, or frameworks they use
- Goals or objectives they've mentioned

Return a JSON array. If no significant facts to extract, return empty array: []

Format:
[
  { "content": "descriptive fact", "category": "fact|preference|project|skill|other", "confidence": 0.0-1.0 }
]

Categories:
- fact: Personal info (name, job title, location, company)
- skill: Technical abilities, languages, frameworks
- project: Current work, projects, products
- preference: Style preferences, communication preferences
- other: Anything else useful

CONVERSATION:
{{CONVERSATION}}

JSON RESPONSE:`;

interface ExtractedMemory {
    content: string;
    category: "fact" | "preference" | "project" | "skill" | "other";
    confidence: number;
}

/**
 * Extract memories from a conversation using the configured model
 */
export async function extractMemoriesFromConversation(
    messages: Message[],
    chatId: string
): Promise<UserMemory[]> {
    const settings = await getSettings();

    // Check if auto-extraction is enabled
    if (settings.memoryAutoExtract === false) {
        return [];
    }

    // Need at least a few exchanges to extract meaningful info
    if (messages.length < 4) {
        return [];
    }

    // Get the last 10 messages for analysis (to limit token usage)
    const recentMessages = messages.slice(-10);

    // Format conversation
    const conversationText = recentMessages
        .map((m) => {
            const role = m.role === "user" ? "User" : "Assistant";
            const content = getTextFromMessageContent(m.content);
            return `${role}: ${content}`;
        })
        .join("\n\n");

    const prompt = EXTRACTION_PROMPT.replace("{{CONVERSATION}}", conversationText);

    try {
        // Get the extraction model - default to OpenRouter format
        const modelId = settings.memoryModelId || "openai/gpt-4o-mini";

        console.log("[Memory] Starting extraction for chat:", chatId, "with model:", modelId);

        // Get available API keys to find a provider
        const apiKeys = await db.apiKeys.toArray();
        const llmProviderIds = apiKeys
            .map((k) => k.provider)
            .filter((p) =>
                ["openrouter", "openai", "anthropic", "groq", "together"].includes(p) ||
                p.startsWith("custom-openai:")
            );

        console.log("[Memory] Available providers:", llmProviderIds);

        const providerId = pickBestProviderId({
            modelId,
            availableProviderIds: llmProviderIds,
        });

        if (!providerId) {
            console.warn("No provider available for memory extraction");
            return [];
        }

        const apiKeyEntry = apiKeys.find((k) => k.provider === providerId);
        if (!apiKeyEntry) {
            console.warn("No API key for memory extraction provider:", providerId);
            return [];
        }

        // Make API call to extract memories
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKeyEntry.key,
            },
            body: JSON.stringify({
                providerId,
                providerBaseUrl: apiKeyEntry.baseUrl,
                modelId,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        if (!response.ok) {
            console.error("Memory extraction API error:", response.status);
            return [];
        }

        // Parse the streaming response to get the full text
        const reader = response.body?.getReader();
        if (!reader) return [];

        let fullText = "";
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            // Parse SSE data
            const lines = chunk.split("\n");
            for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === "text-delta" && data.textDelta) {
                            fullText += data.textDelta;
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        }

        // Extract JSON from the response
        const jsonMatch = fullText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.log("No memories extracted from conversation");
            return [];
        }

        const extracted: ExtractedMemory[] = JSON.parse(jsonMatch[0]);

        // Filter and validate
        const validMemories = extracted.filter(
            (m) =>
                m.content &&
                m.content.length > 5 &&
                m.content.length < 500 &&
                m.confidence >= 0.5 &&
                ["fact", "preference", "project", "skill", "other"].includes(m.category)
        );

        // Check for duplicates with existing memories
        const existingMemories = await import("./memory-store").then((mod) =>
            mod.getAllMemories()
        );

        const newMemories: UserMemory[] = [];

        for (const mem of validMemories) {
            // Simple duplicate check (could be enhanced with semantic similarity)
            const isDuplicate = existingMemories.some(
                (existing) =>
                    existing.content.toLowerCase().includes(mem.content.toLowerCase().slice(0, 20)) ||
                    mem.content.toLowerCase().includes(existing.content.toLowerCase().slice(0, 20))
            );

            if (!isDuplicate) {
                const newMem = await addMemory({
                    content: mem.content,
                    category: mem.category,
                    confidence: mem.confidence,
                    source: "auto",
                    chatId,
                    isActive: true,
                });
                newMemories.push(newMem);
            }
        }

        // Show toast if we extracted memories
        if (newMemories.length > 0) {
            toast.success(`Learned ${newMemories.length} new fact${newMemories.length > 1 ? 's' : ''} about you`);
        }

        return newMemories;
    } catch (error) {
        console.error("Error extracting memories:", error);
        return [];
    }
}

/**
 * Trigger memory extraction after a conversation ends
 * (Call this when user switches chats or after some idle time)
 */
export async function maybeExtractMemories(
    messages: Message[],
    chatId: string
): Promise<void> {
    const settings = await getSettings();

    // Skip if memory is disabled
    if (settings.memoryEnabled === false || settings.memoryAutoExtract === false) {
        return;
    }

    // Extract in the background (don't await to avoid blocking)
    extractMemoriesFromConversation(messages, chatId).then((extracted) => {
        if (extracted.length > 0) {
            console.log(`Extracted ${extracted.length} new memories from chat ${chatId}`);
        }
    }).catch((err) => {
        console.error("Background memory extraction failed:", err);
    });
}
