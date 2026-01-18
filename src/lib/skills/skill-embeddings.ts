import { db, type SkillEmbedding, type Skill } from "@/lib/db/schema";

/**
 * Error types for embedding operations
 */
export type EmbeddingErrorType = "network" | "auth" | "rate_limit" | "api" | "unknown";

export interface EmbeddingError {
  type: EmbeddingErrorType;
  message: string;
  status?: number;
}

/**
 * Classify an embedding error based on status code and message
 */
function classifyEmbeddingError(status: number, message: string): EmbeddingError {
  if (status === 401 || status === 403 || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("invalid api key")) {
    return { type: "auth", message: "Invalid or expired API key", status };
  }
  if (status === 429 || message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("quota")) {
    return { type: "rate_limit", message: "Rate limit exceeded - try again later", status };
  }
  if (status >= 500 || message.toLowerCase().includes("server error")) {
    return { type: "api", message: "Embedding service temporarily unavailable", status };
  }
  if (status === 0 || message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch")) {
    return { type: "network", message: "Network connection failed", status };
  }
  return { type: "unknown", message: message || "Unknown embedding error", status };
}

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
      }
    }

    cacheInitialized = true;
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

    return embedding;
  } catch (error) {
    console.error(`[Skill Embeddings] Failed to generate embedding for ${skill.name}:`, error);
    return null;
  }
}

/**
 * Check if skill embedding needs regeneration (missing, description changed, or model changed)
 */
export async function needsEmbeddingRegeneration(
  skill: Skill,
  targetModelId?: string
): Promise<{ needsRegen: boolean; reason: "missing" | "description_changed" | "model_changed" | "none" }> {
  const existing = await db.skillEmbeddings.get(skill.id);

  // No embedding exists
  if (!existing) {
    return { needsRegen: true, reason: "missing" };
  }

  // Model changed
  if (targetModelId && existing.modelId !== targetModelId) {
    return { needsRegen: true, reason: "model_changed" };
  }

  // Description changed
  const currentHash = hashString(skill.description);
  if (existing.descriptionHash !== currentHash) {
    return { needsRegen: true, reason: "description_changed" };
  }

  return { needsRegen: false, reason: "none" };
}

/**
 * Regenerate embeddings for skills that need it
 * Generates both description embeddings (for backward compat) and trigger phrase embeddings (for matching)
 */
export async function regenerateAllEmbeddings(
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<{ generated: number; failed: number; skipped: number; reasons: Record<string, number> }> {
  const skills = await db.skills.filter((s) => s.isEnabled).toArray();
  let generated = 0;
  let failed = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {
    missing: 0,
    description_changed: 0,
    model_changed: 0,
  };

  for (const skill of skills) {
    const { needsRegen, reason } = await needsEmbeddingRegeneration(skill, modelId);
    if (needsRegen) {
      reasons[reason] = (reasons[reason] || 0) + 1;
      const embedding = await generateSkillEmbedding(skill, apiKey, providerId, modelId);
      if (embedding) {
        generated++;
      } else {
        failed++;
      }
    } else {
      skipped++;
    }

    // Also generate trigger phrase embeddings (autoApplyEmbeddings) if skill has autoApplyQueries
    if (skill.autoApplyQueries && skill.autoApplyQueries.length > 0) {
      const triggerEmbeddings: number[][] = [];
      for (const query of skill.autoApplyQueries) {
        const emb = await getEmbedding(query, apiKey, providerId, modelId);
        if (emb) {
          triggerEmbeddings.push(emb);
        }
      }
      if (triggerEmbeddings.length > 0) {
        await db.skills.update(skill.id, {
          autoApplyEmbeddings: triggerEmbeddings,
          updatedAt: Date.now(),
        });
      }
    }

    // Also generate exclusion phrase embeddings if skill has exclusionQueries
    if (skill.exclusionQueries && skill.exclusionQueries.length > 0) {
      const exclusionEmbeddings: number[][] = [];
      for (const query of skill.exclusionQueries) {
        const emb = await getEmbedding(query, apiKey, providerId, modelId);
        if (emb) {
          exclusionEmbeddings.push(emb);
        }
      }
      if (exclusionEmbeddings.length > 0) {
        await db.skills.update(skill.id, {
          exclusionEmbeddings: exclusionEmbeddings,
          updatedAt: Date.now(),
        });
      }
    }
  }

  // Reload cache after regeneration
  await loadEmbeddingsCache();

  return { generated, failed, skipped, reasons };
}

/**
 * Delete embedding for a skill
 */
export async function deleteSkillEmbedding(skillId: string): Promise<void> {
  await db.skillEmbeddings.delete(skillId);
  embeddingsCache.delete(skillId);
}

/**
 * Compute average of multiple embeddings (centroid)
 */
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  if (embeddings.length === 1) return embeddings[0];

  const dimensions = embeddings[0].length;
  const result = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      result[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    result[i] /= embeddings.length;
  }

  return result;
}

/**
 * Generate individual embeddings for autoApply and exclusion queries.
 * Each query gets its own embedding for more precise matching.
 * This should be called when a skill is created or its queries are updated.
 */
export async function generateSkillQueryEmbeddings(
  skillId: string,
  autoApplyQueries: string[] | undefined,
  exclusionQueries: string[] | undefined,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<{ autoApplyEmbeddings?: number[][]; exclusionEmbeddings?: number[][] }> {
  const result: { autoApplyEmbeddings?: number[][]; exclusionEmbeddings?: number[][] } = {};

  // Generate individual embeddings for each autoApply query (positive examples)
  if (autoApplyQueries && autoApplyQueries.length > 0) {
    const embeddings: number[][] = [];
    for (const query of autoApplyQueries) {
      const embedding = await getEmbedding(query, apiKey, providerId, modelId);
      if (embedding) {
        embeddings.push(embedding);
      }
    }
    if (embeddings.length > 0) {
      result.autoApplyEmbeddings = embeddings;
    }
  }

  // Generate individual embeddings for each exclusion query (negative examples)
  if (exclusionQueries && exclusionQueries.length > 0) {
    const embeddings: number[][] = [];
    for (const query of exclusionQueries) {
      const embedding = await getEmbedding(query, apiKey, providerId, modelId);
      if (embedding) {
        embeddings.push(embedding);
      }
    }
    if (embeddings.length > 0) {
      result.exclusionEmbeddings = embeddings;
    }
  }

  return result;
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
 * Result type for getEmbedding - either success with embedding or failure with error info
 */
export type EmbeddingResult =
  | { success: true; embedding: number[] }
  | { success: false; error: EmbeddingError };

/**
 * Get embedding for a single text (for user message matching)
 * Returns structured result with either embedding or error info for better debugging
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
      // Parse error response for better classification
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // Use status text if JSON parsing fails
      }

      const classifiedError = classifyEmbeddingError(response.status, errorMessage);
      console.warn(`[Skill Embeddings] API error (${classifiedError.type}): ${classifiedError.message}`);
      return null;
    }

    const data = await response.json();
    return data.embeddings?.[0] || null;
  } catch (error) {
    // Handle network errors and other exceptions
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const classifiedError = classifyEmbeddingError(0, errorMessage);
    console.warn(`[Skill Embeddings] ${classifiedError.type} error: ${classifiedError.message}`);
    return null;
  }
}

/**
 * Get embedding with detailed error info (for debugging)
 */
export async function getEmbeddingWithError(
  text: string,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<EmbeddingResult> {
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
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // Use status text if JSON parsing fails
      }
      return { success: false, error: classifyEmbeddingError(response.status, errorMessage) };
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0];
    if (!embedding) {
      return { success: false, error: { type: "api", message: "No embedding returned from API" } };
    }
    return { success: true, embedding };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: classifyEmbeddingError(0, errorMessage) };
  }
}
