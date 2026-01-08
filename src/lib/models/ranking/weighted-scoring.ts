import type { Model } from "@/lib/constants/models";
import rankingRulesData from "../rules/ranking-rules.json";

const rankingRules = rankingRulesData as any;

export interface ScoringFactors {
  benchmarkScore: number;
  costEfficiency: number;
  contextLength: number;
  speed: number;
  userRating: number;
}

export interface ModelScore {
  model: Model;
  score: number;
  factors: ScoringFactors;
}

/**
 * Calculate weighted score for a model
 */
export function calculateWeightedScore(
  model: Model,
  useCase?: string
): ModelScore {
  const factors = rankingRules.ranking.factors;
  const baseWeights = factors.reduce(
    (acc: Record<string, number>, f: { name: string; weight: number }) => {
      acc[f.name] = f.weight;
      return acc;
    },
    {}
  );

  const weights = getWeightsForUseCase(baseWeights, useCase);

  // Calculate individual factor scores (0-1 normalized)
  const benchmarkScore = calculateBenchmarkScore(model, useCase);
  const costEfficiency = calculateCostEfficiency(model);
  const contextLength = calculateContextLengthScore(model);
  const speed = calculateSpeedScore(model);
  const userRating = 0.5; // Placeholder - would come from user feedback

  const factorScores: ScoringFactors = {
    benchmarkScore,
    costEfficiency,
    contextLength,
    speed,
    userRating,
  };

  // Calculate weighted sum
  const totalScore =
    benchmarkScore * (weights.benchmark_score || 0.3) +
    costEfficiency * (weights.cost_efficiency || 0.2) +
    contextLength * (weights.context_length || 0.15) +
    speed * (weights.speed || 0.15) +
    userRating * (weights.user_rating || 0.2);

  return {
    model,
    score: Math.max(0, Math.min(1, totalScore)), // Clamp to 0-1
    factors: factorScores,
  };
}

function getWeightsForUseCase(base: Record<string, number>, useCase?: string) {
  // Bias toward quality for "best match" use-cases (avoid free/cheap models dominating rankings).
  if (useCase === "coding") {
    return {
      ...base,
      benchmark_score: 0.5,
      user_rating: 0.25,
      context_length: 0.15,
      speed: 0.1,
      cost_efficiency: 0.0,
    };
  }

  if (useCase === "reasoning") {
    return {
      ...base,
      benchmark_score: 0.5,
      user_rating: 0.25,
      context_length: 0.15,
      speed: 0.1,
      cost_efficiency: 0.0,
    };
  }

  if (useCase === "vision") {
    return {
      ...base,
      benchmark_score: 0.45,
      user_rating: 0.25,
      context_length: 0.15,
      speed: 0.1,
      cost_efficiency: 0.05,
    };
  }

  if (useCase === "fast") {
    return {
      ...base,
      speed: 0.4,
      cost_efficiency: 0.25,
      benchmark_score: 0.2,
      user_rating: 0.1,
      context_length: 0.05,
    };
  }

  if (useCase === "cheap") {
    return {
      ...base,
      cost_efficiency: 0.4,
      benchmark_score: 0.2,
      user_rating: 0.2,
      speed: 0.1,
      context_length: 0.1,
    };
  }

  return base;
}

/**
 * Calculate benchmark score based on use case
 */
function calculateBenchmarkScore(model: Model, useCase?: string): number {
  // Placeholder - would use actual benchmark data
  // For now, use heuristics based on model characteristics

  if (useCase === "coding") {
    // Models known for coding
    if (
      model.id.includes("claude-opus")
    ) {
      return 0.97;
    }
    if (model.id.includes("gpt-4.1")) {
      return 0.95;
    }
    if (
      model.id.includes("gpt-4o") ||
      model.id.includes("gpt-4-turbo") ||
      model.id.includes("gpt-4") ||
      model.id.includes("chatgpt") ||
      model.id.includes("o1") ||
      model.id.includes("o3")
    ) {
      return 0.9;
    }
    if (model.id.includes("claude-sonnet")) {
      return 0.85;
    }
    if (model.id.includes("devstral") || model.id.includes("deepseek")) {
      return 0.82;
    }
    if (model.id.includes("code")) {
      return 0.78;
    }
    return 0.6;
  }

  if (useCase === "reasoning") {
    if (
      model.id.includes("o1") ||
      model.id.includes("o3") ||
      model.id.includes("deep-think") ||
      model.id.includes("r1")
    ) {
      return 0.95;
    }
    if (model.id.includes("claude-opus")) {
      return 0.85;
    }
    return 0.6;
  }

  if (useCase === "vision") {
    if (model.supportsVision) {
      if (model.id.includes("gpt-4o") || model.id.includes("gemini")) {
        return 0.9;
      }
      return 0.7;
    }
    return 0.3;
  }

  // General score
  if (
    model.id.includes("gpt-4o") ||
    model.id.includes("claude-opus") ||
    model.id.includes("gemini-3")
  ) {
    return 0.85;
  }
  if (
    model.id.includes("claude-sonnet") ||
    model.id.includes("gemini-2.5")
  ) {
    return 0.75;
  }

  return 0.6;
}

/**
 * Calculate cost efficiency score (higher is better)
 */
function calculateCostEfficiency(model: Model): number {
  const totalCost = model.inputCost + model.outputCost;

  if (totalCost === 0) return 1.0; // Free models
  if (totalCost < 0.1) return 0.9; // Very cheap
  if (totalCost < 0.5) return 0.8; // Cheap
  if (totalCost < 1.0) return 0.7; // Moderate
  if (totalCost < 5.0) return 0.5; // Expensive
  if (totalCost < 20.0) return 0.3; // Very expensive
  return 0.1; // Extremely expensive
}

/**
 * Calculate context length score
 */
function calculateContextLengthScore(model: Model): number {
  const config = rankingRules.ranking.contextLengthScoring || {};
  const min = config.min || 4096;
  const max = config.max || 1000000;
  const optimal = config.optimal || 128000;

  const contextLength = model.contextLength || 0;

  if (contextLength < min) return 0.3;
  if (contextLength >= max) return 1.0; // Cap at max

  // Score based on proximity to optimal
  if (contextLength >= optimal) {
    // Beyond optimal is still good, but diminishing returns
    const excess = contextLength - optimal;
    const maxExcess = max - optimal;
    return 1.0 - excess / maxExcess * 0.2; // Slight penalty for excess
  }

  // Below optimal - linear scale
  return 0.3 + (contextLength - min) / (optimal - min) * 0.7;
}

/**
 * Calculate speed score (placeholder - would use actual metrics)
 */
function calculateSpeedScore(model: Model): number {
  // Heuristics based on model name and cost
  if (model.id.includes("mini") || model.id.includes("flash") || model.id.includes("haiku")) {
    return 0.9; // Fast models
  }
  if (model.id.includes("turbo") || model.id.includes("fast")) {
    return 0.85;
  }
  if (model.inputCost + model.outputCost < 0.5) {
    return 0.8; // Cheap models are often fast
  }
  if (model.id.includes("opus") || model.id.includes("gpt-4")) {
    return 0.6; // Larger models are slower
  }
  return 0.7; // Default
}

/**
 * Rank models by weighted score
 */
export function rankModelsByScore(
  models: Model[],
  useCase?: string
): ModelScore[] {
  const scores = models.map((model) => calculateWeightedScore(model, useCase));
  return scores.sort((a, b) => b.score - a.score);
}
