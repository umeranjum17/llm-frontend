import { db } from "@/lib/db/schema";
import type { UserMemory } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/queries";
import { searchSimilar, deleteDocuments } from "@/lib/rag/vector-store";
import { generateEmbedding } from "@/lib/rag/embeddings";

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

async function getCacheTTL(): Promise<number> {
    try {
        const settings = await getSettings();
        return (settings?.memoryCacheTTL ?? 30) * 1000; // Convert seconds to ms
    } catch {
        return DEFAULT_CACHE_TTL_MS;
    }
}

function isCacheValid(timestamp: number, ttlMs: number): boolean {
    return Date.now() - timestamp < ttlMs;
}

// Clear cache when memories are modified
function invalidateCache() {
    memoryCache = null;
}

/**
 * SHA-256 hash of normalized content for exact deduplication
 */
async function hashContent(text: string): Promise<string> {
    const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
    const data = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Refresh cache in background (doesn't block, fire-and-forget)
 * Call this after chat response to keep cache fresh for next interaction
 * @param query - Optional query to use for the refresh (e.g., last user message)
 */
export function refreshCacheInBackground(query?: string) {
    // Invalidate current cache
    memoryCache = null;

    // Need a query for search - skip if none provided
    if (!query || query.trim().length === 0) {
        return;
    }

    // Fire-and-forget refresh - don't await
    searchMemories(query).catch(() => {});
}

/**
 * Resolve a provider + API key + model for memory extraction.
 * Checks openrouter first, then anthropic, then openai.
 */
async function resolveExtractionProvider(): Promise<{
    providerId: string;
    modelId: string;
    apiKey: string;
    baseUrl?: string;
} | null> {
    try {
        const { useApiKeysStore } = await import("@/stores/api-keys-store");
        const settings = await getSettings();

        const providerOrder = ["openrouter", "anthropic", "openai"];
        const memoryModels = settings?.memoryModelIdsByProvider ?? {};

        // Cheap default models per provider
        const defaultModels: Record<string, string> = {
            openrouter: "google/gemini-flash-1.5-8b",
            anthropic: "claude-3-5-haiku-latest",
            openai: "gpt-4o-mini",
        };

        for (const providerId of providerOrder) {
            const keyRecord = useApiKeysStore.getState().getKeyForProvider(providerId);
            if (keyRecord?.key) {
                const modelId = memoryModels[providerId] || defaultModels[providerId] || defaultModels.openrouter;
                return {
                    providerId,
                    modelId,
                    apiKey: keyRecord.key,
                    baseUrl: keyRecord.baseUrl,
                };
            }
        }

        return null;
    } catch (error) {
        console.error("[Memory] Failed to resolve extraction provider:", error);
        return null;
    }
}

/**
 * Call the /api/memory/extract route for LLM-based memory extraction
 */
async function extractMemoriesFromMessages(
    messages: { role: string; content: string }[]
): Promise<Array<{ content: string; category: string; confidence: number }>> {
    const provider = await resolveExtractionProvider();
    if (!provider) {
        console.warn("[Memory] No API key available for memory extraction. Skipping.");
        return [];
    }

    // Format messages into a conversation string
    const conversation = messages
        .map(m => `${m.role}: ${m.content}`)
        .join("\n");

    try {
        const response = await fetch("/api/memory/extract", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": provider.apiKey,
            },
            body: JSON.stringify({
                providerId: provider.providerId,
                providerBaseUrl: provider.baseUrl,
                modelId: provider.modelId,
                conversation,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error("[Memory] Extraction API error:", err);
            return [];
        }

        const data = await response.json();
        return data.memories ?? [];
    } catch (error) {
        console.error("[Memory] Extraction request failed:", error);
        return [];
    }
}

/**
 * Store a single memory in both IndexedDB and the vector store.
 */
async function storeMemoryRecord(
    content: string,
    category: string,
    confidence: number,
    source: "auto" | "manual",
    chatId?: string,
): Promise<string> {
    const memoryId = crypto.randomUUID();
    const now = Date.now();

    // Store in userMemories table (IndexedDB)
    await db.userMemories.add({
        id: memoryId,
        content,
        category: category as UserMemory["category"],
        confidence,
        source,
        chatId,
        createdAt: now,
        updatedAt: now,
        isActive: true,
    });

    // Store in vector store using put to avoid duplicate-ID errors
    try {
        const embedding = await generateEmbedding(content);
        await db.vectorDocuments.put({
            id: `memory-${memoryId}`,
            text: content,
            embedding,
            metadata: { type: "memory" as const, memoryId, category },
        });
    } catch (error) {
        console.error("[Memory] Failed to store vector embedding:", error);
        // Memory is still in IndexedDB, just not searchable via vectors
    }

    return memoryId;
}

/**
 * Add a memory (manual string or LLM-extracted from messages)
 */
export async function addMemory(content: string | { role: string; content: string }[]) {
    // Validate content first
    if (!content) {
        console.warn("[Memory] addMemory called with no content, skipping");
        return null;
    }

    // Handle string content - store directly as manual memory
    if (typeof content === "string") {
        const trimmed = content.trim();
        if (!trimmed) {
            console.warn("[Memory] addMemory called with empty string, skipping");
            return null;
        }

        try {
            // Check for semantic duplicates first (covers exact + near-exact)
            // This is cheaper than hashing every existing memory

            // Check for semantic duplicates
            try {
                const similar = await searchSimilar(trimmed, 3, 0.70, { type: "memory" });
                for (const match of similar) {
                    if (match.similarity >= 0.90) {
                        // Duplicate - bump existing memory
                        const existingId = match.metadata?.memoryId;
                        if (existingId) {
                            await db.userMemories.update(existingId, { updatedAt: Date.now() });
                        }
                        invalidateCache();
                        return { id: existingId, memory: match.text };
                    }
                }
            } catch {
                // Vector search may fail if embedding model not loaded yet - continue with storage
            }

            const memoryId = await storeMemoryRecord(trimmed, "other", 1.0, "manual");
            invalidateCache();
            return { id: memoryId, memory: trimmed };
        } catch (error) {
            console.error("[Memory] Failed to add manual memory:", error);
            return null;
        }
    }

    // Handle array content - extract memories via LLM
    if (Array.isArray(content)) {
        // Filter out messages with empty content
        const validMessages = content.filter(
            msg => msg && typeof msg.content === "string" && msg.content.trim().length > 0
        );
        if (validMessages.length === 0) {
            console.warn("[Memory] addMemory called with no valid messages, skipping");
            return null;
        }

        try {
            const extracted = await extractMemoriesFromMessages(validMessages);
            const storedMemories: Array<{ id: string; memory: string }> = [];

            for (const item of extracted) {
                // Only store memories with sufficient confidence
                if (item.confidence < 0.7) continue;

                const contentText = item.content.trim();
                if (!contentText) continue;

                // Semantic dedup via vector search (covers exact + near-exact)
                let finalConfidence = item.confidence;
                let skipStore = false;

                try {
                    const similar = await searchSimilar(contentText, 3, 0.70, { type: "memory" });
                    for (const match of similar) {
                        if (match.similarity >= 0.90) {
                            // Very similar - treat as duplicate, bump existing
                            const existingId = match.metadata?.memoryId;
                            if (existingId) {
                                await db.userMemories.update(existingId, { updatedAt: Date.now() });
                            }
                            skipStore = true;
                            break;
                        } else if (match.similarity >= 0.70) {
                            // Somewhat similar - store with reduced confidence
                            finalConfidence = 0.5;
                        }
                    }
                } catch {
                    // Vector search may fail - continue with storage
                }

                if (skipStore) continue;

                const memoryId = await storeMemoryRecord(
                    contentText,
                    item.category,
                    finalConfidence,
                    "auto",
                );
                storedMemories.push({ id: memoryId, memory: contentText });
            }

            invalidateCache();
            return { results: storedMemories };
        } catch (error) {
            console.error("[Memory] Failed to extract/store memories:", error);
            return null;
        }
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
        return memoryCache.searchResults;
    }

    // Deduplicate in-flight requests
    if (inFlightSearch) {
        return inFlightSearch;
    }

    // Make the request
    inFlightSearch = (async () => {
        try {
            const results = await searchSimilar(query, 5, 0.5, { type: "memory" });

            // Map vector results to MemoryItems, enriching with IndexedDB timestamps
            const memoryItems: MemoryItem[] = [];

            for (const r of results) {
                const memoryId = r.metadata?.memoryId || r.id;
                let created_at: string | undefined;
                let updated_at: string | undefined;

                // Look up the corresponding userMemories record for timestamps
                try {
                    const record = await db.userMemories.get(memoryId);
                    if (record) {
                        created_at = new Date(record.createdAt).toISOString();
                        updated_at = new Date(record.updatedAt).toISOString();
                    }
                } catch {
                    // Ignore lookup failures
                }

                memoryItems.push({
                    id: memoryId,
                    memory: r.text,
                    score: r.similarity,
                    created_at,
                    updated_at,
                });
            }

            // Update global cache
            memoryCache = {
                searchResults: memoryItems,
                allMemories: memoryCache?.allMemories || [],
                timestamp: Date.now(),
            };

            return memoryItems;
        } catch (error) {
            console.error("[Memory] Search failed:", error);
            return [];
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
        return memoryCache.allMemories;
    }

    // Deduplicate in-flight requests
    if (inFlightGetAll) {
        return inFlightGetAll;
    }

    inFlightGetAll = (async () => {
        try {
            // Read active memories from IndexedDB, sorted by most recently updated
            const allRecords = await db.userMemories.toArray();
            const records = allRecords
                .filter(m => m.isActive)
                .sort((a, b) => b.updatedAt - a.updatedAt);

            const memoryItems: MemoryItem[] = records.map(m => ({
                id: m.id,
                memory: m.content,
                created_at: new Date(m.createdAt).toISOString(),
                updated_at: new Date(m.updatedAt).toISOString(),
            }));

            // Update global cache
            memoryCache = {
                searchResults: memoryCache?.searchResults || [],
                allMemories: memoryItems,
                timestamp: Date.now(),
            };

            return memoryItems;
        } catch (error) {
            console.error("[Memory] getAllMemories failed:", error);
            return [];
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
    try {
        // Delete from IndexedDB
        await db.userMemories.delete(memoryId);

        // Delete from vector store
        await deleteDocuments({ memoryId });

        // Invalidate cache since memories changed
        invalidateCache();
        return { success: true };
    } catch (error) {
        console.error("[Memory] Delete failed:", error);
        return null;
    }
}

/**
 * Get history of how a memory changed
 * Not supported in native mode - returns null
 */
export async function getMemoryHistory(_memoryId: string) {
    return null;
}

/**
 * Invalidate the memory cache (call when settings change)
 */
export function clearMemoryCache() {
    invalidateCache();
}

/**
 * Memory decay - prune old memories that haven't been reinforced.
 * Runs at most once per 24h, deletes up to 3 stale memories per run.
 * Skips if total memory count is <= 20.
 */
export async function runMemoryDecay(): Promise<void> {
    try {
        const settings = await getSettings();
        if (!settings?.memoryDecayEnabled) return;

        const now = Date.now();
        const lastRun = settings.lastMemoryDecayAt ?? 0;
        const ONE_DAY = 24 * 60 * 60 * 1000;

        // Only run once per day
        if (now - lastRun < ONE_DAY) return;

        // Read all active memories directly from IndexedDB
        const allMemories = await db.userMemories.toArray();
        const allRecords = allMemories.filter(m => m.isActive);

        if (allRecords.length <= 20) {
            // Update timestamp so we don't re-check constantly
            const { updateSettings } = await import("@/lib/db/queries");
            await updateSettings({ lastMemoryDecayAt: now });
            return;
        }

        const decayDays = settings.memoryDecayDays ?? 60;
        const thresholdMs = decayDays * ONE_DAY;

        // Find stale memories (older than threshold, sorted oldest first)
        const staleMemories = allRecords
            .filter(m => {
                const age = now - m.updatedAt;
                return age > thresholdMs;
            })
            .sort((a, b) => a.updatedAt - b.updatedAt); // oldest first

        // Delete up to 3
        const toDelete = staleMemories.slice(0, 3);
        for (const memory of toDelete) {
            console.log(`[Memory Decay] Pruning stale memory: "${memory.content.slice(0, 50)}..."`);
            // Delete from both IndexedDB and vector store
            await db.userMemories.delete(memory.id);
            await deleteDocuments({ memoryId: memory.id });
        }

        if (toDelete.length > 0) {
            console.log(`[Memory Decay] Pruned ${toDelete.length} stale memories`);
            invalidateCache();
        }

        const { updateSettings } = await import("@/lib/db/queries");
        await updateSettings({ lastMemoryDecayAt: now });
    } catch (error) {
        console.error("[Memory Decay] Failed:", error);
    }
}

/**
 * Reconcile memory embeddings after S3 sync.
 * Ensures all userMemories have corresponding vectorDocuments and vice versa.
 *
 * 1. MISSING: userMemory exists but no vectorDocument → generate embedding
 * 2. ORPHAN: vectorDocument exists but no userMemory → delete the vectorDocument
 * 3. STALE: both exist but userMemory.updatedAt > vectorDocument creation → re-embed
 */
export async function reconcileMemoryEmbeddings(): Promise<void> {
    try {
        // Get all active userMemories
        const allMemories = await db.userMemories.toArray();
        const activeMemories = allMemories.filter(m => m.isActive);
        const memoryMap = new Map(activeMemories.map(m => [m.id, m]));

        // Get all memory-type vectorDocuments
        const allVectorDocs = await db.vectorDocuments
            .where("metadata.type")
            .equals("memory")
            .toArray();
        const vectorMap = new Map<string, typeof allVectorDocs[0]>();
        for (const doc of allVectorDocs) {
            const memId = doc.metadata?.memoryId;
            if (memId) vectorMap.set(memId, doc);
        }

        let created = 0;
        let deleted = 0;
        let updated = 0;

        // 1. MISSING: userMemory exists but no vectorDocument
        for (const [memId, memory] of memoryMap) {
            if (!vectorMap.has(memId)) {
                try {
                    const embedding = await generateEmbedding(memory.content);
                    await db.vectorDocuments.put({
                        id: `memory-${memId}`,
                        text: memory.content,
                        embedding,
                        metadata: { type: "memory" as const, memoryId: memId, category: memory.category },
                    });
                    created++;
                } catch (error) {
                    console.error(`[Memory Reconcile] Failed to embed memory ${memId}:`, error);
                }
            }
        }

        // 2. ORPHAN: vectorDocument exists but no active userMemory
        for (const [memId, doc] of vectorMap) {
            if (!memoryMap.has(memId)) {
                await db.vectorDocuments.delete(doc.id);
                deleted++;
            }
        }

        if (created > 0 || deleted > 0 || updated > 0) {
            console.log(`[Memory Reconcile] Created: ${created}, Deleted: ${deleted}, Updated: ${updated}`);
            invalidateCache();
        }
    } catch (error) {
        console.error("[Memory Reconcile] Failed:", error);
    }
}

// Re-export types that might be needed
export type { MemoryItem };
