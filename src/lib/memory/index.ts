import { db } from "@/lib/db/schema";

interface MemoryItem {
    id: string;
    memory: string;
    created_at?: string;
    updated_at?: string;
    score?: number; // Similarity score from search
}

// Cache for memory search results (query -> { results, timestamp })
const searchCache = new Map<string, { results: MemoryItem[]; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds TTL

// In-flight request deduplication (query -> Promise)
const inFlightRequests = new Map<string, Promise<MemoryItem[]>>();

function getCachedSearch(query: string): MemoryItem[] | null {
    const cached = searchCache.get(query);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.results;
    }
    // Expired or not found
    if (cached) searchCache.delete(query);
    return null;
}

function setCachedSearch(query: string, results: MemoryItem[]) {
    searchCache.set(query, { results, timestamp: Date.now() });
}

// Clear cache when memories are modified
function invalidateSearchCache() {
    searchCache.clear();
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
    const result = await callMem0Api("add", { content: messages });
    // Invalidate cache since memories changed
    invalidateSearchCache();
    return result;
}

/**
 * Search for relevant memories based on a query (conversation context)
 * Uses caching and request deduplication to minimize API calls
 */
export async function searchMemories(query: string): Promise<MemoryItem[]> {
    // Check cache first
    const cached = getCachedSearch(query);
    if (cached) {
        console.log("[Memory] Cache hit for query:", query.slice(0, 30));
        return cached;
    }

    // Check if there's already an in-flight request for this query
    const inFlight = inFlightRequests.get(query);
    if (inFlight) {
        console.log("[Memory] Deduplicating request for query:", query.slice(0, 30));
        return inFlight;
    }

    // Make the request and track it
    const requestPromise = (async () => {
        try {
            const results = await callMem0Api("search", { query });
            const memoryItems = results || [];
            setCachedSearch(query, memoryItems);
            return memoryItems;
        } finally {
            inFlightRequests.delete(query);
        }
    })();

    inFlightRequests.set(query, requestPromise);
    return requestPromise;
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
    const result = await callMem0Api("delete", { memoryId });
    // Invalidate cache since memories changed
    invalidateSearchCache();
    return result;
}

/**
 * Get history of how a memory changed
 */
export async function getMemoryHistory(memoryId: string) {
    return callMem0Api("history", { memoryId });
}

// Re-export types that might be needed
export type { MemoryItem };
