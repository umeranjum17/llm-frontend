import { db, type SkillEmbedding, type Skill } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/queries";

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
 *
 * This function includes skills in the cache if they have EITHER:
 * 1. An entry in skillEmbeddings table (description embedding)
 * 2. autoApplyEmbeddings stored directly on the skill (trigger phrase embeddings)
 *
 * For auto-trigger skills missing BOTH sources, it triggers background generation.
 */
export async function loadEmbeddingsCache(): Promise<void> {
  try {
    const [skills, embeddings] = await Promise.all([
      db.skills.filter((s) => s.isEnabled).toArray(),
      db.skillEmbeddings.toArray(),
    ]);

    // Create a map of skillId -> embedding (from skillEmbeddings table)
    const embeddingMap = new Map<string, number[]>();
    for (const emb of embeddings) {
      embeddingMap.set(emb.skillId, emb.embedding);
    }

    // Build cache with skill data
    embeddingsCache.clear();
    const skillsMissingEmbeddings: Skill[] = [];

    for (const skill of skills) {
      const descriptionEmbedding = embeddingMap.get(skill.id);
      const hasAutoApplyEmbeddings = skill.autoApplyEmbeddings && skill.autoApplyEmbeddings.length > 0;

      // Include skill if it has EITHER embedding source
      if (descriptionEmbedding || hasAutoApplyEmbeddings) {
        embeddingsCache.set(skill.id, {
          embedding: descriptionEmbedding || [],
          skill
        });
      }

      // Track skills that need any embedding generated:
      // - Auto-trigger skills missing description embedding
      // - Skills with autoApplyQueries but no autoApplyEmbeddings
      // - Skills with exclusionQueries but no exclusionEmbeddings
      // - Skills whose description hash changed
      const needsDescriptionEmbedding = skill.trigger.type === "auto" && !descriptionEmbedding;
      const needsAutoApplyEmbeddings = skill.autoApplyQueries && skill.autoApplyQueries.length > 0 && !hasAutoApplyEmbeddings;
      const needsExclusionEmbeddings = skill.exclusionQueries && skill.exclusionQueries.length > 0 &&
        (!skill.exclusionEmbeddings || skill.exclusionEmbeddings.length === 0);
      const descriptionChanged = descriptionEmbedding && embeddingMap.has(skill.id) &&
        (() => {
          const existing = embeddings.find(e => e.skillId === skill.id);
          return existing && existing.descriptionHash !== hashString(skill.description);
        })();

      if (needsDescriptionEmbedding || needsAutoApplyEmbeddings || needsExclusionEmbeddings || descriptionChanged) {
        skillsMissingEmbeddings.push(skill);
      }
    }

    cacheInitialized = true;

    // Auto-generate embeddings for skills with missing/outdated embeddings (non-blocking)
    if (skillsMissingEmbeddings.length > 0) {
      console.log(`[Skill Embeddings] ${skillsMissingEmbeddings.length} skills need embedding generation:`,
        skillsMissingEmbeddings.map(s => s.name).join(", "));
      autoGenerateMissingEmbeddings(skillsMissingEmbeddings);
    }
  } catch (error) {
    console.error("[Skill Embeddings] Failed to load cache:", error);
  }
}

/**
 * Auto-generate embeddings for skills that are missing both description and trigger phrase embeddings.
 * This runs in the background without blocking and silently fails if no API key is available.
 *
 * The function:
 * 1. Gets the embeddings API key from settings
 * 2. If no key available, logs and returns (skills with synced autoApplyEmbeddings still work)
 * 3. Generates both description embedding (skillEmbeddings table) and trigger phrase embeddings (autoApplyEmbeddings)
 * 4. Updates the cache after each successful generation
 */
async function autoGenerateMissingEmbeddings(skills: Skill[]): Promise<void> {
  try {
    // Get embeddings settings
    const settings = await getSettings();
    const providerId = settings?.embeddingsProvider || "openrouter";
    const modelId = settings?.embeddingsModelId;

    // Import API keys store dynamically to avoid circular dependencies
    // This is a client-side module, so we need to check if we're in browser
    if (typeof window === "undefined") {
      console.log("[Skill Embeddings] Auto-generation skipped (server-side)");
      return;
    }

    // Dynamically import to avoid SSR issues
    const { useApiKeysStore } = await import("@/stores/api-keys-store");
    const apiKeyEntry = useApiKeysStore.getState().getKeyForProvider(providerId);

    if (!apiKeyEntry?.key) {
      console.log(`[Skill Embeddings] No API key for ${providerId}, skipping auto-generation`);
      return;
    }

    const apiKey = apiKeyEntry.key;
    console.log(`[Skill Embeddings] Auto-generating embeddings for ${skills.length} skills...`);

    for (const skill of skills) {
      try {
        // Generate description embedding (stored in skillEmbeddings table)
        const result = await generateSkillEmbedding(skill, apiKey, providerId, modelId);

        if (result.success) {
          console.log(`[Skill Embeddings] Generated description embedding for "${skill.name}"`);
        } else {
          console.warn(`[Skill Embeddings] Failed to generate embedding for "${skill.name}": ${result.error}`);
        }

        // Also generate trigger phrase embeddings if skill has autoApplyQueries
        if (skill.autoApplyQueries && skill.autoApplyQueries.length > 0) {
          const triggerEmbeddings: number[][] = [];

          for (const query of skill.autoApplyQueries) {
            const embedding = await getEmbedding(query, apiKey, providerId, modelId);
            if (embedding) {
              triggerEmbeddings.push(embedding);
            }
          }

          if (triggerEmbeddings.length > 0) {
            await db.skills.update(skill.id, {
              autoApplyEmbeddings: triggerEmbeddings,
              updatedAt: Date.now(),
            });

            // Update cache with new embeddings
            const cached = embeddingsCache.get(skill.id);
            if (cached) {
              // Refresh skill data with new autoApplyEmbeddings
              const updatedSkill = await db.skills.get(skill.id);
              if (updatedSkill) {
                embeddingsCache.set(skill.id, { ...cached, skill: updatedSkill });
              }
            }

            console.log(`[Skill Embeddings] Generated ${triggerEmbeddings.length} trigger phrase embeddings for "${skill.name}"`);
          }
        }

        // Generate exclusion embeddings if skill has exclusionQueries
        if (skill.exclusionQueries && skill.exclusionQueries.length > 0) {
          const exclusionEmbeddings: number[][] = [];

          for (const query of skill.exclusionQueries) {
            const embedding = await getEmbedding(query, apiKey, providerId, modelId);
            if (embedding) {
              exclusionEmbeddings.push(embedding);
            }
          }

          if (exclusionEmbeddings.length > 0) {
            await db.skills.update(skill.id, {
              exclusionEmbeddings: exclusionEmbeddings,
              updatedAt: Date.now(),
            });
            console.log(`[Skill Embeddings] Generated ${exclusionEmbeddings.length} exclusion embeddings for "${skill.name}"`);
          }
        }
      } catch (skillError) {
        // Log but continue with next skill
        console.warn(`[Skill Embeddings] Error generating embeddings for "${skill.name}":`, skillError);
      }
    }

    console.log("[Skill Embeddings] Auto-generation complete");
  } catch (error) {
    // Silent failure - this is a background operation
    console.warn("[Skill Embeddings] Auto-generation failed:", error);
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
 * Result type for embedding generation
 */
export type GenerateEmbeddingResult =
  | { success: true; embedding: number[] }
  | { success: false; error: string; skillName: string };

/**
 * Generate and store embedding for a skill
 */
export async function generateSkillEmbedding(
  skill: Skill,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<GenerateEmbeddingResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
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
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;

      // Try to parse JSON error
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorText;
      } catch {
        // Use raw text if not JSON
      }

      console.error("[Skill Embeddings] API error:", errorMessage);
      return {
        success: false,
        error: errorMessage,
        skillName: skill.name
      };
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0];

    if (!embedding) {
      console.error("[Skill Embeddings] No embedding returned");
      return {
        success: false,
        error: "No embedding returned from API",
        skillName: skill.name
      };
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

    return { success: true, embedding };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Skill Embeddings] Failed to generate embedding for ${skill.name}:`, error);
    return {
      success: false,
      error: errorMessage,
      skillName: skill.name
    };
  } finally {
    clearTimeout(timeoutId);
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
): Promise<{
  generated: number;
  failed: number;
  skipped: number;
  reasons: Record<string, number>;
  errors: Array<{ skillName: string; error: string }>;
}> {
  const skills = await db.skills.filter((s) => s.isEnabled).toArray();
  let generated = 0;
  let failed = 0;
  let skipped = 0;
  const reasons: Record<string, number> = {
    missing: 0,
    description_changed: 0,
    model_changed: 0,
  };
  const errors: Array<{ skillName: string; error: string }> = [];

  for (const skill of skills) {
    const { needsRegen, reason } = await needsEmbeddingRegeneration(skill, modelId);
    if (needsRegen) {
      reasons[reason] = (reasons[reason] || 0) + 1;
      const result = await generateSkillEmbedding(skill, apiKey, providerId, modelId);
      if (result.success) {
        generated++;
      } else {
        failed++;
        errors.push({ skillName: result.skillName, error: result.error });
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

  return { generated, failed, skipped, reasons, errors };
}

/**
 * Auto-generate embeddings for a single skill if needed.
 * Call this after creating or updating a skill to ensure embeddings stay current.
 * Runs in the background without blocking.
 */
export function autoGenerateEmbeddingsForSkill(skill: Skill): void {
  if (!skill.isEnabled) return;

  // Check if skill actually needs any embeddings
  const needsDescription = skill.trigger.type === "auto";
  const needsAutoApply = skill.autoApplyQueries && skill.autoApplyQueries.length > 0;
  const needsExclusion = skill.exclusionQueries && skill.exclusionQueries.length > 0;

  if (!needsDescription && !needsAutoApply && !needsExclusion) return;

  // Fire and forget - runs in background
  autoGenerateMissingEmbeddings([skill]).then(() => {
    console.log(`[Skill Embeddings] Background generation complete for "${skill.name}"`);
  });
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
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
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeoutId);
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
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
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeoutId);
  }
}
