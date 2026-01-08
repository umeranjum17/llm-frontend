import { db, type UserMemory } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/queries";

// ============= MEMORY QUERIES =============

export async function getAllMemories(): Promise<UserMemory[]> {
    return await db.userMemories
        .orderBy("createdAt")
        .reverse()
        .toArray();
}

export async function getActiveMemories(): Promise<UserMemory[]> {
    return await db.userMemories
        .where("isActive")
        .equals(1)
        .toArray();
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
}

export async function deleteMemory(id: string): Promise<void> {
    await db.userMemories.delete(id);
}

export async function deleteAllMemories(): Promise<void> {
    await db.userMemories.clear();
}

export async function toggleMemoryActive(id: string): Promise<void> {
    const memory = await db.userMemories.get(id);
    if (memory) {
        await updateMemory(id, { isActive: !memory.isActive });
    }
}

// ============= MEMORY CONTEXT =============

/**
 * Get formatted memory context to inject into system prompts
 */
export async function getMemoryContext(): Promise<string> {
    const settings = await getSettings();

    // Check if memory is enabled
    if (settings.memoryEnabled === false) {
        return "";
    }

    const memories = await getActiveMemories();

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

    return `## User Information (from memory)

${sections.join("\n\n")}

Use this information to personalize your responses naturally, without explicitly stating you "remember" unless directly asked.`;
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
        await db.userMemories.bulkDelete(toDelete.map((m) => m.id));
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
