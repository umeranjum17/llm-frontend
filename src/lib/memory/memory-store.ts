import { db, type UserMemory } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/queries";
import { storeDocument, deleteDocuments, searchSimilar } from "@/lib/rag/vector-store";

// ============= MEMORY QUERIES =============

export async function getAllMemories(): Promise<UserMemory[]> {
    return await db.userMemories
        .orderBy("createdAt")
        .reverse()
        .toArray();
}

export async function getActiveMemories(): Promise<UserMemory[]> {
    // Dexie doesn't index booleans well, so filter in memory
    const all = await db.userMemories.toArray();
    return all.filter((m) => m.isActive === true);
}

export async function getMemoriesByCategory(category: UserMemory["category"]): Promise<UserMemory[]> {
    return await db.userMemories
        .where("category")
        .equals(category)
        .toArray();
}

export async function addMemory(
    memory: Omit<UserMemory, "id" | "createdAt" | "updatedAt">
): Promise<UserMemory> {
    const now = Date.now();
    const newMemory: UserMemory = {
        ...memory,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    };
    await db.userMemories.add(newMemory);

    // Sync to vector store for retrieval
    if (newMemory.isActive) {
        await storeDocument({
            id: `memory:${newMemory.id}`,
            text: newMemory.content,
            metadata: {
                type: "memory",
                memoryId: newMemory.id,
                category: newMemory.category,
                timestamp: now,
            },
        }).catch(err => console.error("Failed to vectorise memory:", err));
    }

    return newMemory;
}

export async function addMemoryManual(content: string, category: UserMemory["category"] = "other"): Promise<UserMemory> {
    return addMemory({
        content,
        category,
        confidence: 1.0,
        source: "manual",
        isActive: true,
    });
}

export async function updateMemory(id: string, updates: Partial<UserMemory>): Promise<void> {
    await db.userMemories.update(id, { ...updates, updatedAt: Date.now() });

    // Update vector store
    const updated = await db.userMemories.get(id);
    if (updated) {
        if (updated.isActive) {
            await storeDocument({
                id: `memory:${updated.id}`,
                text: updated.content,
                metadata: {
                    type: "memory",
                    memoryId: updated.id,
                    category: updated.category,
                    timestamp: updated.updatedAt,
                },
            }).catch(err => console.error("Failed to update vector memory:", err));
        } else {
            // If inactive, remove from vector store
            await deleteDocuments({ memoryId: id }).catch(console.error);
        }
    }
}

export async function deleteMemory(id: string): Promise<void> {
    await db.userMemories.delete(id);
    await deleteDocuments({ memoryId: id }).catch(console.error);
}

export async function deleteAllMemories(): Promise<void> {
    await db.userMemories.clear();
    // Ideally we would clear only memory vectors, but we don't have a bulk delete by type yet
    // For now we will rely on syncing or manual cleanup if needed
    // TODO: Add delete by type to vector store
}

export async function toggleMemoryActive(id: string): Promise<void> {
    const memory = await db.userMemories.get(id);
    if (memory) {
        await updateMemory(id, { isActive: !memory.isActive });
    }
}

/**
 * Sync all active memories to vector store
 * (Useful for migration or fixing drift)
 */
export async function syncMemoriesToVectorStore(): Promise<number> {
    const memories = await getActiveMemories();
    let count = 0;

    for (const mem of memories) {
        try {
            await storeDocument({
                id: `memory:${mem.id}`,
                text: mem.content,
                metadata: {
                    type: "memory",
                    memoryId: mem.id,
                    category: mem.category,
                    timestamp: mem.updatedAt,
                },
            });
            count++;
        } catch (e) {
            console.error("Failed to sync memory:", mem.id, e);
        }
    }
    return count;
}

// ============= MEMORY CONTEXT =============

/**
 * Get formatted memory context to inject into system prompts
 */
export async function getMemoryContext(query?: string): Promise<string> {
    const settings = await getSettings();

    // Check if memory is enabled
    if (settings.memoryEnabled === false) {
        return "";
    }

    let memories: UserMemory[] = [];

    if (query && query.trim().length > 2) {
        // Semantic retrieval
        try {
            // Searh for relevant memories
            const results = await searchSimilar(query, 5, 0.45, { type: "memory" });

            // Filter results that are actually memories
            const memoryIds = results
                .filter(r => r.metadata?.type === "memory" && r.metadata?.memoryId)
                .map(r => r.metadata!.memoryId!);

            if (memoryIds.length > 0) {
                // Fetch full objects to be safe
                const dbMemories = await db.userMemories.bulkGet(memoryIds);
                memories = dbMemories
                    .filter((m): m is UserMemory => !!m && m.isActive)
                    // Re-sort to match relevance
                    .sort((a, b) => {
                        const idxA = memoryIds.indexOf(a.id);
                        const idxB = memoryIds.indexOf(b.id);
                        return idxA - idxB;
                    });
            }
        } catch (error) {
            console.error("Memory retrieval failed, falling back to recent:", error);
            const all = await getActiveMemories();
            memories = all.slice(0, 10);
        }
    } else {
        // Fallback for no query: return most recent 5 active memories
        // This keeps the context "alive" without being overwhelming
        const all = await getActiveMemories();
        memories = all.slice(0, 5);
    }

    if (memories.length === 0) {
        return "";
    }

    // Group by category
    const grouped = {
        fact: memories.filter((m) => m.category === "fact"),
        preference: memories.filter((m) => m.category === "preference"),
        project: memories.filter((m) => m.category === "project"),
        skill: memories.filter((m) => m.category === "skill"),
        other: memories.filter((m) => m.category === "other"),
    };

    const sections: string[] = [];

    if (grouped.fact.length > 0) {
        sections.push("### About the user:\n" + grouped.fact.map((m) => `- ${m.content}`).join("\n"));
    }

    if (grouped.skill.length > 0) {
        sections.push("### Skills & expertise:\n" + grouped.skill.map((m) => `- ${m.content}`).join("\n"));
    }

    if (grouped.project.length > 0) {
        sections.push("### Current projects:\n" + grouped.project.map((m) => `- ${m.content}`).join("\n"));
    }

    if (grouped.preference.length > 0) {
        sections.push("### Preferences:\n" + grouped.preference.map((m) => `- ${m.content}`).join("\n"));
    }

    if (grouped.other.length > 0) {
        sections.push("### Other notes:\n" + grouped.other.map((m) => `- ${m.content}`).join("\n"));
    }

    if (sections.length === 0) {
        return "";
    }

    return `## Relevant User Memories
The following facts about the user were retrieved based on the conversation context. Use them if relevant, otherwise ignore.

${sections.join("\n\n")}`;
}

// ============= MEMORY CLEANUP =============

/**
 * Clean up expired memories based on retention settings
 */
export async function cleanupExpiredMemories(): Promise<number> {
    const settings = await getSettings();

    // If no retention period set, don't delete anything
    if (!settings.memoryRetentionDays) {
        return 0;
    }

    const cutoffDate = Date.now() - (settings.memoryRetentionDays * 24 * 60 * 60 * 1000);

    const expiredMemories = await db.userMemories
        .where("createdAt")
        .below(cutoffDate)
        .toArray();

    const idsToDelete = expiredMemories.map((m) => m.id);

    if (idsToDelete.length > 0) {
        await db.userMemories.bulkDelete(idsToDelete);
        for (const id of idsToDelete) {
            await deleteDocuments({ memoryId: id }).catch(console.error);
        }
    }

    return idsToDelete.length;
}

/**
 * Ensure memory count doesn't exceed max limit
 */
export async function enforceMemoryLimit(): Promise<number> {
    const settings = await getSettings();
    const maxItems = settings.memoryMaxItems || 100;

    const allMemories = await db.userMemories.orderBy("createdAt").toArray();

    if (allMemories.length <= maxItems) {
        return 0;
    }

    // Delete oldest memories to stay under limit (keep manual ones longer)
    const autoMemories = allMemories.filter((m) => m.source === "auto");
    const toDelete = autoMemories.slice(0, allMemories.length - maxItems);

    if (toDelete.length > 0) {
        const ids = toDelete.map((m) => m.id);
        await db.userMemories.bulkDelete(ids);
        for (const id of ids) {
            await deleteDocuments({ memoryId: id }).catch(console.error);
        }
    }

    return toDelete.length;
}

// ============= MEMORY COUNT =============

export async function getMemoryCount(): Promise<number> {
    return await db.userMemories.count();
}

export async function getMemoryStats(): Promise<{
    total: number;
    active: number;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
}> {
    const all = await db.userMemories.toArray();

    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    let active = 0;

    for (const m of all) {
        byCategory[m.category] = (byCategory[m.category] || 0) + 1;
        bySource[m.source] = (bySource[m.source] || 0) + 1;
        if (m.isActive) active++;
    }

    return {
        total: all.length,
        active,
        byCategory,
        bySource,
    };
}
