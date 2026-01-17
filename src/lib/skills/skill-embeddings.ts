import { db, type SkillEmbedding, type Skill } from "@/lib/db/schema";

/**
 * Simple hash function for description change detection
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * In-memory cache for skill embeddings
 * Loaded once on init for fast matching
 */
let embeddingsCache: Map<string, { embedding: number[]; skill: Skill }> = new Map();
let cacheInitialized = false;

/**
 * Load all skill embeddings into memory cache
 */
export async function loadEmbeddingsCache(): Promise<void> {
  try {
    const [skills, embeddings] = await Promise.all([
      db.skills.filter((s) => s.isEnabled).toArray(),
      db.skillEmbeddings.toArray(),
    ]);

    console.log(`[Skill Embeddings] Loading cache: ${skills.length} enabled skills, ${embeddings.length} embeddings in DB`);

    // Create a map of skillId -> embedding
    const embeddingMap = new Map<string, number[]>();
    for (const emb of embeddings) {
      embeddingMap.set(emb.skillId, emb.embedding);
    }

    // Build cache with skill data
    embeddingsCache.clear();
    for (const skill of skills) {
      const embedding = embeddingMap.get(skill.id);
      if (embedding) {
        embeddingsCache.set(skill.id, { embedding, skill });
      } else {
        console.log(`[Skill Embeddings] No embedding for skill: ${skill.name} (${skill.id})`);
      }
    }

    cacheInitialized = true;
    console.log(`[Skill Embeddings] Cache ready: ${embeddingsCache.size} skills with embeddings`);
  } catch (error) {
    console.error("[Skill Embeddings] Failed to load cache:", error);
  }
}

/**
 * Get all cached skill embeddings
 */
export function getSkillEmbeddingsFromCache(): Array<{ skillId: string; embedding: number[]; skill: Skill }> {
  return Array.from(embeddingsCache.entries()).map(([skillId, data]) => ({
    skillId,
    embedding: data.embedding,
    skill: data.skill,
  }));
}

/**
 * Check if cache is initialized
 */
export function isCacheInitialized(): boolean {
  return cacheInitialized;
}

/**
 * Generate and store embedding for a skill
 */
export async function generateSkillEmbedding(
  skill: Skill,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<number[] | null> {
  try {
    const response = await fetch("/api/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        texts: [skill.description],
        providerId,
        modelId,
      }),
    });

    if (!response.ok) {
      console.error("[Skill Embeddings] API error:", await response.text());
      return null;
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0];

    if (!embedding) {
      console.error("[Skill Embeddings] No embedding returned");
      return null;
    }

    // Store in database
    const skillEmbedding: SkillEmbedding = {
      skillId: skill.id,
      embedding,
      modelId: data.modelId || "text-embedding-3-small",
      descriptionHash: hashString(skill.description),
      createdAt: Date.now(),
    };

    await db.skillEmbeddings.put(skillEmbedding);

    // Update cache
    embeddingsCache.set(skill.id, { embedding, skill });

    console.log(`[Skill Embeddings] Generated embedding for skill: ${skill.name}`);
    return embedding;
  } catch (error) {
    console.error(`[Skill Embeddings] Failed to generate embedding for ${skill.name}:`, error);
    return null;
  }
}

/**
 * Check if skill embedding needs regeneration (description changed)
 */
export async function needsEmbeddingRegeneration(skill: Skill): Promise<boolean> {
  const existing = await db.skillEmbeddings.get(skill.id);
  if (!existing) return true;

  const currentHash = hashString(skill.description);
  return existing.descriptionHash !== currentHash;
}

/**
 * Regenerate embeddings for all skills
 * @param force - If true, regenerate all embeddings regardless of changes
 */
export async function regenerateAllEmbeddings(
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string,
  force: boolean = false
): Promise<{ generated: number; failed: number; skipped: number }> {
  const skills = await db.skills.filter((s) => s.isEnabled).toArray();
  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const skill of skills) {
    const needsRegen = force || (await needsEmbeddingRegeneration(skill));
    if (needsRegen) {
      const embedding = await generateSkillEmbedding(skill, apiKey, providerId, modelId);
      if (embedding) {
        generated++;
      } else {
        failed++;
      }
    } else {
      skipped++;
    }
  }

  // Reload cache after regeneration
  await loadEmbeddingsCache();

  return { generated, failed, skipped };
}

/**
 * Delete embedding for a skill
 */
export async function deleteSkillEmbedding(skillId: string): Promise<void> {
  await db.skillEmbeddings.delete(skillId);
  embeddingsCache.delete(skillId);
}

/**
 * Clear all skill embeddings (useful when switching providers)
 */
export async function clearAllEmbeddings(): Promise<void> {
  await db.skillEmbeddings.clear();
  embeddingsCache.clear();
  cacheInitialized = false;
}

/**
 * Get embedding for a single text (for user message matching)
 */
export async function getEmbedding(
  text: string,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<number[] | null> {
  try {
    const response = await fetch("/api/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        texts: [text],
        providerId,
        modelId,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.embeddings?.[0] || null;
  } catch (error) {
    console.error("[Skill Embeddings] Failed to get embedding:", error);
    return null;
  }
}
