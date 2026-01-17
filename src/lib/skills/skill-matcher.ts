import type { Skill } from "@/lib/db/schema";
import {
  getSkillEmbeddingsFromCache,
  isCacheInitialized,
  loadEmbeddingsCache,
  getEmbedding,
} from "./skill-embeddings";

/**
 * Default similarity threshold for skill matching
 * Higher = more strict matching, Lower = more generous
 * 0.5 provides good balance between precision and recall
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Match result with similarity score
 */
export interface SkillMatchResult {
  skill: Skill;
  similarity: number;
}

/**
 * Find the best matching skill for a user message using embedding similarity
 * Returns null if no skill matches above the threshold
 */
export async function matchSkill(
  userMessage: string,
  apiKey: string,
  options?: {
    providerId?: string;
    modelId?: string;
    threshold?: number;
    excludeManualOnly?: boolean;
  }
): Promise<SkillMatchResult | null> {
  const {
    providerId = "openrouter",
    modelId,
    threshold = DEFAULT_SIMILARITY_THRESHOLD,
    excludeManualOnly = true,
  } = options || {};

  // Ensure cache is initialized
  const cacheWasInitialized = isCacheInitialized();
  console.log("[Skill Matcher] Cache initialized:", cacheWasInitialized);

  if (!cacheWasInitialized) {
    console.log("[Skill Matcher] Loading embeddings cache...");
    await loadEmbeddingsCache();
  }

  // Get skill embeddings from cache
  const skillEmbeddings = getSkillEmbeddingsFromCache();
  console.log("[Skill Matcher] Skills in cache:", skillEmbeddings.length);

  if (skillEmbeddings.length === 0) {
    console.log("[Skill Matcher] No skill embeddings in cache - need to generate embeddings in Settings");
    return null;
  }

  // Filter out manual-only skills if requested
  const eligibleSkills = excludeManualOnly
    ? skillEmbeddings.filter((se) => se.skill.trigger.type === "auto")
    : skillEmbeddings;

  if (eligibleSkills.length === 0) {
    console.log("[Skill Matcher] No auto-trigger skills available");
    return null;
  }

  // Get embedding for user message (must use same model as skill embeddings)
  const messageEmbedding = await getEmbedding(userMessage, apiKey, providerId, modelId);

  if (!messageEmbedding) {
    console.log("[Skill Matcher] Failed to get message embedding");
    return null;
  }

  // Find best match using cosine similarity
  let bestMatch: SkillMatchResult | null = null;
  let bestScore = 0;

  for (const { skillId, embedding, skill } of eligibleSkills) {
    const similarity = cosineSimilarity(messageEmbedding, embedding);

    console.log(`[Skill Matcher] ${skill.name}: ${(similarity * 100).toFixed(1)}%`);

    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = { skill, similarity };
    }
  }

  if (bestMatch) {
    console.log(
      `[Skill Matcher] ✓ Best match: ${bestMatch.skill.name} (${(bestMatch.similarity * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(0)}% threshold)`
    );
  } else {
    console.log(`[Skill Matcher] ✗ No skill matched above threshold (${(threshold * 100).toFixed(0)}%)`);
  }

  return bestMatch;
}

/**
 * Get all skill matches with their similarity scores (for debugging/UI)
 */
export async function getAllSkillMatches(
  userMessage: string,
  apiKey: string,
  providerId: string = "openrouter"
): Promise<SkillMatchResult[]> {
  // Ensure cache is initialized
  if (!isCacheInitialized()) {
    await loadEmbeddingsCache();
  }

  const skillEmbeddings = getSkillEmbeddingsFromCache();

  if (skillEmbeddings.length === 0) {
    return [];
  }

  // Get embedding for user message
  const messageEmbedding = await getEmbedding(userMessage, apiKey, providerId);

  if (!messageEmbedding) {
    return [];
  }

  // Calculate similarity for all skills
  const matches: SkillMatchResult[] = skillEmbeddings.map(({ skill, embedding }) => ({
    skill,
    similarity: cosineSimilarity(messageEmbedding, embedding),
  }));

  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);

  return matches;
}

/**
 * Simple keyword-based fallback matcher for when embeddings are unavailable
 * Uses basic string matching against skill descriptions
 */
export function matchSkillByKeywords(
  userMessage: string,
  skills: Skill[],
  options?: { excludeManualOnly?: boolean }
): Skill | null {
  const { excludeManualOnly = true } = options || {};

  const messageLower = userMessage.toLowerCase();

  const eligibleSkills = excludeManualOnly
    ? skills.filter((s) => s.isEnabled && s.trigger.type === "auto")
    : skills.filter((s) => s.isEnabled);

  let bestMatch: Skill | null = null;
  let bestScore = 0;

  for (const skill of eligibleSkills) {
    // Split description into keywords
    const keywords = skill.description
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((k) => k.length > 2);

    // Count matching keywords
    let matchCount = 0;
    for (const keyword of keywords) {
      if (messageLower.includes(keyword)) {
        matchCount++;
      }
    }

    // Calculate score as percentage of keywords matched
    const score = keywords.length > 0 ? matchCount / keywords.length : 0;

    if (score > bestScore && matchCount >= 2) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  return bestMatch;
}
