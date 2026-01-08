import { getSettings } from "@/lib/db/queries";
import { addMemory } from "./memory-store";
import type { Message, UserMemory } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";

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
        // Call the extraction model
        const modelId = settings.memoryModelId || "gpt-4o-mini";

        // Make API call to extract memories
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                modelId,
                maxTokens: 500,
                temperature: 0.1, // Low temperature for consistent extraction
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
            fullText += decoder.decode(value, { stream: true });
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
