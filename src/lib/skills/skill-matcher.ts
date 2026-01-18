import { db, type Skill } from "@/lib/db/schema";
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
    console.log("[Skill Matcher] No skill embeddings in cache - falling back to keyword matching");
    // Fallback to keyword-based matching when no embeddings are available
    const allSkills = await db.skills.filter((s) => s.isEnabled).toArray();
    const keywordMatch = matchSkillByKeywords(userMessage, allSkills, { excludeManualOnly });
    if (keywordMatch) {
      console.log(`[Skill Matcher] ✓ Keyword match: ${keywordMatch.name}`);
      return { skill: keywordMatch, similarity: 0.6 }; // Assign a reasonable similarity score
    }
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
    console.log(`[Skill Matcher] ✗ No embedding match above threshold (${(threshold * 100).toFixed(0)}%), trying keyword fallback`);
    // Try keyword matching for skills that might not have embeddings yet
    const allSkills = await db.skills.filter((s) => s.isEnabled).toArray();
    const keywordMatch = matchSkillByKeywords(userMessage, allSkills, { excludeManualOnly });
    if (keywordMatch) {
      console.log(`[Skill Matcher] ✓ Keyword fallback match: ${keywordMatch.name}`);
      return { skill: keywordMatch, similarity: 0.55 };
    }
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

// Common words to ignore in keyword matching (too generic, cause false matches)
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "can", "this", "that", "these", "those",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "what", "which", "who", "whom",
  "how", "when", "where", "why", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "not", "only", "own", "same", "so",
  "than", "too", "very", "just", "also", "now", "here", "there", "then",
  "make", "made", "get", "got", "take", "put", "use", "used", "new", "way"
]);

/**
 * Simple keyword-based fallback matcher for when embeddings are unavailable
 * Uses basic string matching against skill descriptions with phrase support
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
    // First check for exact phrase matches (comma-separated in description)
    // Phrases must be 2+ words to be meaningful
    const phrases = skill.description
      .toLowerCase()
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 3 && p.split(/\s+/).length >= 2);

    let phraseMatchScore = 0;
    let matchedPhrases: string[] = [];
    for (const phrase of phrases) {
      if (messageLower.includes(phrase)) {
        // Give higher weight to longer phrase matches
        const wordCount = phrase.split(/\s+/).length;
        phraseMatchScore += wordCount * 3; // Higher weight for phrase matches
        matchedPhrases.push(phrase);
      }
    }

    // Check significant keywords (excluding stop words, min 4 chars)
    const keywords = skill.description
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((k) => k.length >= 4 && !STOP_WORDS.has(k));

    let keywordMatchCount = 0;
    let matchedKeywords: string[] = [];
    for (const keyword of keywords) {
      // Use word boundary matching to avoid partial matches
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(messageLower)) {
        keywordMatchCount++;
        matchedKeywords.push(keyword);
      }
    }

    // Calculate score - require meaningful matches
    const keywordScore = keywords.length > 0 ? keywordMatchCount / keywords.length : 0;
    const score = phraseMatchScore > 0
      ? (phraseMatchScore / Math.max(phrases.length, 1)) + keywordScore
      : keywordScore;

    // Stricter requirements:
    // - Need at least one phrase match of 2+ words, OR
    // - Need at least 2 significant keyword matches
    const hasStrongMatch = matchedPhrases.length >= 1 || keywordMatchCount >= 2;

    // Minimum score threshold to avoid weak matches
    const MIN_SCORE_THRESHOLD = 0.15;

    if (score > bestScore && score >= MIN_SCORE_THRESHOLD && hasStrongMatch) {
      bestScore = score;
      bestMatch = skill;
      console.log(`[Skill Matcher Keyword] ${skill.name}: score=${score.toFixed(2)} (phrases=[${matchedPhrases.join(', ')}], keywords=[${matchedKeywords.join(', ')}])`);
    }
  }

  return bestMatch;
}
