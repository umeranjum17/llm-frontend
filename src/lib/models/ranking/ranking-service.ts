import type { Model } from "@/lib/constants/models";
import { calculateWeightedScore, rankModelsByScore } from "./weighted-scoring";
import { rankModelsByElo, type EloRating } from "./elo-rating";
import rankingRulesData from "../rules/ranking-rules.json";

const rankingRules = rankingRulesData as any;

export interface RankingOptions {
  useCase?: string;
  algorithm?: "weighted_score" | "elo_rating";
  eloRatings?: Map<string, EloRating>;
}

export class RankingService {
  /**
   * Rank models using the configured algorithm
   */
  rankModels(models: Model[], options: RankingOptions = {}): Model[] {
    const algorithm =
      options.algorithm ||
      rankingRules.ranking.algorithms.default ||
      "weighted_score";

    if (algorithm === "elo_rating" && options.eloRatings) {
      const ranked = rankModelsByElo(models, options.eloRatings);
      return ranked.map(({ eloRating, comparisons, ...model }) => model);
    }

    // Default to weighted scoring
    const ranked = rankModelsByScore(models, options.useCase);
    return ranked.map((score) => score.model);
  }

  /**
   * Get top N models for a use case
   */
  getTopModels(
    models: Model[],
    useCase: string,
    limit: number = 10
  ): Model[] {
    const ranked = this.rankModels(models, { useCase });
    return ranked.slice(0, limit);
  }

  /**
   * Calculate score for a single model
   */
  getModelScore(model: Model, useCase?: string) {
    return calculateWeightedScore(model, useCase);
  }
}

// Singleton instance
let rankingServiceInstance: RankingService | null = null;

export function getRankingService(): RankingService {
  if (!rankingServiceInstance) {
    rankingServiceInstance = new RankingService();
  }
  return rankingServiceInstance;
}
