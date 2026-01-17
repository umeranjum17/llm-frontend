import { db } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/queries";

interface MemoryItem {
    id: string;
    memory: string;
    created_at?: string;
    updated_at?: string;
    score?: number; // Similarity score from search
}

// Simple global cache for all memory operations
let memoryCache: {
    searchResults: MemoryItem[];
    allMemories: MemoryItem[];
    timestamp: number;
} | null = null;

// Default cache TTL (can be overridden by settings)
const DEFAULT_CACHE_TTL_MS = 30_000; // 30 seconds

// In-flight request deduplication
let inFlightSearch: Promise<MemoryItem[]> | null = null;
let inFlightGetAll: Promise<MemoryItem[]> | null = null;

// Track invalid API key to avoid repeated failures
let apiKeyInvalid = false;

async function getCacheTTL(): Promise<number> {
    try {
        const settings = await getSettings();
        return (settings?.memoryCacheTTL ?? 30) * 1000; // Convert seconds to ms
    } catch {
        return DEFAULT_CACHE_TTL_MS;
    }
}

async function getUserId(): Promise<string> {
    try {
        const settings = await getSettings();
        return settings?.memoryUserId || "default-user";
    } catch {
        return "default-user";
    }
}

function isCacheValid(timestamp: number, ttlMs: number): boolean {
    return Date.now() - timestamp < ttlMs;
}

// Clear cache when memories are modified
function invalidateCache() {
    memoryCache = null;
    console.log("[Memory] Cache invalidated");
}

/**
 * Refresh cache in background (doesn't block, fire-and-forget)
 * Call this after chat response to keep cache fresh for next interaction
 * @param query - Optional query to use for the refresh (e.g., last user message)
 */
export function refreshCacheInBackground(query?: string) {
    // Invalidate current cache
    memoryCache = null;

    // Need a query for Mem0 search - skip if none provided
    if (!query || query.trim().length === 0) {
        console.log("[Memory] Background refresh skipped - no query provided");
        return;
    }

    // Fire-and-forget refresh - don't await
    searchMemories(query).catch(() => {});
    console.log("[Memory] Background cache refresh triggered");
}

async function getApiKey() {
    const keyRecord = await db.apiKeys.get("mem0");
    if (!keyRecord?.key) return undefined;

    // Keys are stored encrypted in IndexedDB - decrypt before use
    try {
        const { decryptApiKey } = await import("@/lib/crypto/api-key-crypto");
        return await decryptApiKey(keyRecord.key);
    } catch {
        // If decryption fails, key might be plaintext (legacy)
        return keyRecord.key;
    }
}

async function callMem0Api(action: string, payload: any) {
    // Skip if we already know the API key is invalid
    if (apiKeyInvalid) {
        return null;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
        console.warn("[Memory] No Mem0 API key found. Skipping memory operation.");
        return null; // Graceful degradation
    }

    // Get user ID from settings (default: "default-user")
    const userId = await getUserId();

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
            const errorMsg = err.error || "Mem0 API request failed";

            // Detect invalid API key and stop future requests
            if (errorMsg.includes("Invalid API key") || errorMsg.includes("Invalid api key")) {
                console.warn("[Memory] Invalid API key detected. Memory features disabled until key is updated.");
                apiKeyInvalid = true;
                return null;
            }

            throw new Error(errorMsg);
        }

        return await response.json();
    } catch (error: any) {
        // Also catch invalid key errors from exceptions
        if (error?.message?.includes("Invalid API key") || error?.message?.includes("Invalid api key")) {
            console.warn("[Memory] Invalid API key detected. Memory features disabled until key is updated.");
            apiKeyInvalid = true;
            return null;
        }
        console.error(`[Memory] Failed to ${action}:`, error);
        return null;
    }
}

/**
 * Add a memory (or let Mem0 extract from text/messages)
 * Mem0 expects an array of message objects with role and content
 */
export async function addMemory(content: string | { role: string, content: string }[]) {
    // Validate content first
    if (!content) {
        console.warn("[Memory] addMemory called with no content, skipping");
        return null;
    }

    // Handle string content
    if (typeof content === 'string') {
        const trimmed = content.trim();
        if (!trimmed) {
            console.warn("[Memory] addMemory called with empty string, skipping");
            return null;
        }
        // Mem0 expects a list of messages
        const messages = [{ role: "user", content: trimmed }];
        const result = await callMem0Api("add", { content: messages });
        invalidateCache();
        return result;
    }

    // Handle array content
    if (Array.isArray(content)) {
        // Filter out messages with empty content
        const validMessages = content.filter(msg =>
            msg && typeof msg.content === 'string' && msg.content.trim().length > 0
        );
        if (validMessages.length === 0) {
            console.warn("[Memory] addMemory called with no valid messages, skipping");
            return null;
        }
        const result = await callMem0Api("add", { content: validMessages });
        invalidateCache();
        return result;
    }

    console.warn("[Memory] addMemory called with invalid content type:", typeof content);
    return null;
}

/**
 * Search for relevant memories based on a query (conversation context)
 * Uses simple global cache - returns cached results if within TTL
 */
export async function searchMemories(query: string): Promise<MemoryItem[]> {
    const ttl = await getCacheTTL();

    // Check global cache first
    if (memoryCache && isCacheValid(memoryCache.timestamp, ttl)) {
        console.log("[Memory] Cache hit (search)");
        return memoryCache.searchResults;
    }

    // Deduplicate in-flight requests
    if (inFlightSearch) {
        console.log("[Memory] Deduplicating search request");
        return inFlightSearch;
    }

    // Make the request
    inFlightSearch = (async () => {
        try {
            const results = await callMem0Api("search", { query });
            // Mem0 may return either an array or an object like { results: [...] }
            const memoryItems: MemoryItem[] = Array.isArray(results)
                ? results
                : (results?.results ?? []);

            // Update global cache
            memoryCache = {
                searchResults: memoryItems,
                allMemories: memoryCache?.allMemories || [],
                timestamp: Date.now(),
            };

            return memoryItems;
        } finally {
            inFlightSearch = null;
        }
    })();

    return inFlightSearch;
}

/**
 * Get all memories (for the settings page)
 * Uses simple global cache
 */
export async function getAllMemories(): Promise<MemoryItem[]> {
    const ttl = await getCacheTTL();

    // Check global cache first
    if (memoryCache && memoryCache.allMemories.length > 0 && isCacheValid(memoryCache.timestamp, ttl)) {
        console.log("[Memory] Cache hit (getAll)");
        return memoryCache.allMemories;
    }

    // Deduplicate in-flight requests
    if (inFlightGetAll) {
        console.log("[Memory] Deduplicating getAll request");
        return inFlightGetAll;
    }

    inFlightGetAll = (async () => {
        try {
            const results = await callMem0Api("get_all", {});
            const memoryItems = results ? (results.results || results) : [];

            // Update global cache
            memoryCache = {
                searchResults: memoryCache?.searchResults || [],
                allMemories: memoryItems,
                timestamp: Date.now(),
            };

            return memoryItems;
        } finally {
            inFlightGetAll = null;
        }
    })();

    return inFlightGetAll;
}

/**
 * Delete a specific memory
 */
export async function deleteMemory(memoryId: string) {
    const result = await callMem0Api("delete", { memoryId });
    // Invalidate cache since memories changed
    invalidateCache();
    return result;
}

/**
 * Get history of how a memory changed
 */
export async function getMemoryHistory(memoryId: string) {
    return callMem0Api("history", { memoryId });
}

/**
 * Invalidate the memory cache (call when user ID or API key changes)
 */
export function clearMemoryCache() {
    invalidateCache();
    // Reset invalid key flag so we retry with the new key
    apiKeyInvalid = false;
}

// Re-export types that might be needed
export type { MemoryItem };
