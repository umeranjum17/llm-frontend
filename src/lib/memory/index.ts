import { db } from "@/lib/db/schema";

interface MemoryItem {
    id: string;
    memory: string;
    created_at?: string;
    updated_at?: string;
    score?: number; // Similarity score from search
}

async function getApiKey() {
    const keyRecord = await db.apiKeys.get("mem0");
    return keyRecord?.key;
}

async function callMem0Api(action: string, payload: any) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.warn("[Memory] No Mem0 API key found. Skipping memory operation.");
        return null; // Graceful degradation
    }

    // Default user ID for local-first app
    const userId = "default-user";

    try {
        const response = await fetch("/api/memory", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-mem0-key": apiKey
            },
            body: JSON.stringify({
                action,
                userId,
                ...payload
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Mem0 API request failed");
        }

        return await response.json();
    } catch (error) {
        console.error(`[Memory] Failed to ${action}:`, error);
        return null;
    }
}

/**
 * Add a memory (or let Mem0 extract from text/messages)
 * Mem0 expects an array of message objects with role and content
 */
export async function addMemory(content: string | { role: string, content: string }[]) {
    // Mem0's "add" expects a list of messages - wrap string content
    const messages = typeof content === 'string'
        ? [{ role: "user", content }]
        : content;
    return callMem0Api("add", { content: messages });
}

/**
 * Search for relevant memories based on a query (conversation context)
 */
export async function searchMemories(query: string): Promise<MemoryItem[]> {
    const results = await callMem0Api("search", { query });
    return results || [];
}

/**
 * Get all memories (for the settings page)
 */
export async function getAllMemories(): Promise<MemoryItem[]> {
    const results = await callMem0Api("get_all", {});
    return results ? (results.results || results) : [];
}

/**
 * Delete a specific memory
 */
export async function deleteMemory(memoryId: string) {
    return callMem0Api("delete", { memoryId });
}

/**
 * Get history of how a memory changed
 */
export async function getMemoryHistory(memoryId: string) {
    return callMem0Api("history", { memoryId });
}

// Re-export types that might be needed
export type { MemoryItem };
