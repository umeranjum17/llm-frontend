import { db, type Skill } from "@/lib/db/schema";
import {
  getSkillEmbeddingsFromCache,
  isCacheInitialized,
  loadEmbeddingsCache,
  getEmbedding,
} from "./skill-embeddings";

/**
 * Check if there are enabled auto-trigger skills that don't have embeddings generated.
 * Returns count of such skills for warning display.
 */
export async function getAutoSkillsMissingEmbeddings(): Promise<{
  total: number;
  missing: number;
  skillNames: string[];
}> {
  // Load cache to ensure we have latest embeddings
  await loadEmbeddingsCache();

  // Get all enabled auto-trigger skills
  const allSkills = await db.skills
    .filter((s) => s.isEnabled && s.trigger.type === "auto")
    .toArray();

  if (allSkills.length === 0) {
    return { total: 0, missing: 0, skillNames: [] };
  }

  // Get skills that have embeddings
  const cachedEmbeddings = getSkillEmbeddingsFromCache();
  const skillIdsWithEmbeddings = new Set(cachedEmbeddings.map((e) => e.skillId));

  // Find auto skills without embeddings
  const missingSkills = allSkills.filter((s) => !skillIdsWithEmbeddings.has(s.id));

  return {
    total: allSkills.length,
    missing: missingSkills.length,
    skillNames: missingSkills.map((s) => s.name),
  };
}

/**
 * Minimum floor threshold for skill matching
 * This is the absolute minimum - anything below this is considered irrelevant
 * Using Top-1 approach: always match the best skill if above this floor
 * 0.25 is industry standard minimum for RAG systems
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.25;

/**
 * Threshold for switching away from a sticky skill to a different skill.
 * Must be higher than the match floor to prevent accidental skill switches
 * during an ongoing skill session.
 */
export const SKILL_SWITCH_THRESHOLD = 0.45;

/**
 * Weight for exclusion query similarity penalty
 * Applied as a multiplier to the MAX exclusion similarity
 * Keep this low - exclusions should be a gentle nudge, not a hard block
 */
const EXCLUSION_QUERY_WEIGHT = 0.15;

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
 * Match result with similarity score and query embedding
 */
export interface SkillMatchResult {
  skill: Skill;
  similarity: number;
  queryEmbedding?: number[]; // The embedding of the user's query (for auto-apply checks)
}

/**
 * Minimum message length to use without context
 * Short messages like "retry", "continue", "again" need conversation context
 */
const MIN_MESSAGE_LENGTH_FOR_STANDALONE = 20;

/**
 * Build context-aware message for short user inputs
 * Combines recent conversation with the short message for better matching
 */
function buildContextAwareMessage(
  userMessage: string,
  conversationContext?: Array<{ role: string; content: string }>
): string {
  // If message is long enough, use it as-is
  if (userMessage.length >= MIN_MESSAGE_LENGTH_FOR_STANDALONE) {
    return userMessage;
  }

  // If no context, use message as-is
  if (!conversationContext || conversationContext.length === 0) {
    return userMessage;
  }

  // Get last few messages for context (up to 3)
  const recentContext = conversationContext.slice(-3);

  // Build context string: focus on what the conversation was about
  const contextParts: string[] = [];
  for (const msg of recentContext) {
    // Only include user and assistant messages, truncate for relevance
    if (msg.role === "user" || msg.role === "assistant") {
      const truncated = msg.content.slice(0, 200);
      contextParts.push(truncated);
    }
  }

  if (contextParts.length === 0) {
    return userMessage;
  }

  // Combine context with current message
  // Format: "Context: [previous conversation]. Current request: [user message]"
  const contextString = contextParts.join(" ");
  return `Context: ${contextString}. Current request: ${userMessage}`;
}

/**
 * Find the best matching skill for a user message using embedding similarity
 * Returns null if no skill matches above the threshold
 *
 * This function is designed to fail gracefully - network errors, API issues,
 * and other failures will return null (no skill matched).
 */
export async function matchSkill(
  userMessage: string,
  apiKey: string,
  options?: {
    providerId?: string;
    modelId?: string;
    threshold?: number;
    excludeManualOnly?: boolean;
    conversationContext?: Array<{ role: string; content: string }>;
  }
): Promise<SkillMatchResult | null> {
  const {
    providerId = "openrouter",
    modelId,
    threshold = DEFAULT_SIMILARITY_THRESHOLD,
    excludeManualOnly = true,
    conversationContext,
  } = options || {};

  try {
    // Always reload cache to ensure we have latest embeddings
    await loadEmbeddingsCache();
  } catch (cacheError) {
    // Cache loading failed - continue with empty cache
    console.warn("[Skill Matcher] Cache init failed:", cacheError);
  }

  // Get skill embeddings from cache
  const skillEmbeddings = getSkillEmbeddingsFromCache();

  if (skillEmbeddings.length === 0) {
    return null;
  }

  // Filter out manual-only skills if requested
  const eligibleSkills = excludeManualOnly
    ? skillEmbeddings.filter((se) => se.skill.trigger.type === "auto")
    : skillEmbeddings;

  if (eligibleSkills.length === 0) {
    return null;
  }

  // Build context-aware message for short inputs like "retry", "continue", etc.
  const messageToEmbed = buildContextAwareMessage(userMessage, conversationContext);

  // Get embedding for user message (must use same model as skill embeddings)
  // Wrapped in try-catch for extra resilience against network/API issues
  let messageEmbedding: number[] | null = null;
  try {
    messageEmbedding = await getEmbedding(messageToEmbed, apiKey, providerId, modelId);
  } catch (embedError) {
    console.warn("[Skill Matcher] Embedding request failed:", embedError);
  }

  if (!messageEmbedding) {
    return null;
  }

  // Find best match using cosine similarity with positive/exclusion adjustments
  let bestMatch: SkillMatchResult | null = null;
  let bestScore = 0;

  for (const { embedding, skill } of eligibleSkills) {
    // PRIMARY: Use trigger phrase embeddings if available
    let primaryScore = 0;

    if (skill.autoApplyEmbeddings && skill.autoApplyEmbeddings.length > 0) {
      // Find best matching trigger phrase (MAX similarity)
      for (const queryEmbedding of skill.autoApplyEmbeddings) {
        const sim = cosineSimilarity(messageEmbedding, queryEmbedding);
        if (sim > primaryScore) {
          primaryScore = sim;
        }
      }
    } else {
      // Fallback: use description embedding for backward compatibility
      primaryScore = cosineSimilarity(messageEmbedding, embedding);
    }

    // Calculate exclusion penalty using average similarity (gentle overall penalty)
    let exclusionPenalty = 0;
    if (skill.exclusionEmbeddings && skill.exclusionEmbeddings.length > 0) {
      let totalExclusion = 0;
      for (const queryEmbedding of skill.exclusionEmbeddings) {
        totalExclusion += cosineSimilarity(messageEmbedding, queryEmbedding);
      }
      exclusionPenalty = (totalExclusion / skill.exclusionEmbeddings.length) * EXCLUSION_QUERY_WEIGHT;
    }

    // Final score = primary match - exclusion penalty
    const adjustedScore = primaryScore - exclusionPenalty;

    // Top-1 approach: track the best match regardless of threshold
    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestMatch = { skill, similarity: adjustedScore, queryEmbedding: messageEmbedding };
    }
  }

  // Apply minimum floor threshold - only return if best match is above floor
  if (bestMatch && bestMatch.similarity >= threshold) {
    return bestMatch;
  }

  return null;
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
  const matches: SkillMatchResult[] = [];

  for (const { skill, embedding } of skillEmbeddings) {
    let similarity = 0;

    if (skill.autoApplyEmbeddings && skill.autoApplyEmbeddings.length > 0) {
      for (const queryEmbedding of skill.autoApplyEmbeddings) {
        const sim = cosineSimilarity(messageEmbedding, queryEmbedding);
        if (sim > similarity) {
          similarity = sim;
        }
      }
    } else if (embedding.length > 0) {
      similarity = cosineSimilarity(messageEmbedding, embedding);
    } else {
      continue;
    }

    matches.push({ skill, similarity });
  }

  // Sort by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);

  return matches;
}
