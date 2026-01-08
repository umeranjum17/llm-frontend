import type { Model } from "@/lib/constants/models";

export interface Comparison {
  modelA: string;
  modelB: string;
  winner: "A" | "B" | "tie";
  useCase?: string;
}

export interface EloRating {
  modelId: string;
  rating: number;
  comparisons: number;
}

const INITIAL_RATING = 1500;
const K_FACTOR = 32;

/**
 * Calculate expected score for model A against model B
 */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Update Elo ratings based on a comparison
 */
export function updateEloRatings(
  ratings: Map<string, EloRating>,
  comparison: Comparison
): Map<string, EloRating> {
  const newRatings = new Map(ratings);

  const ratingA = newRatings.get(comparison.modelA) || {
    modelId: comparison.modelA,
    rating: INITIAL_RATING,
    comparisons: 0,
  };
  const ratingB = newRatings.get(comparison.modelB) || {
    modelId: comparison.modelB,
    rating: INITIAL_RATING,
    comparisons: 0,
  };

  const expectedA = expectedScore(ratingA.rating, ratingB.rating);
  const expectedB = expectedScore(ratingB.rating, ratingA.rating);

  let scoreA = 0.5; // Tie
  if (comparison.winner === "A") scoreA = 1.0;
  else if (comparison.winner === "B") scoreA = 0.0;

  const newRatingA = ratingA.rating + K_FACTOR * (scoreA - expectedA);
  const newRatingB = ratingB.rating + K_FACTOR * (1 - scoreA - expectedB);

  newRatings.set(comparison.modelA, {
    modelId: comparison.modelA,
    rating: newRatingA,
    comparisons: ratingA.comparisons + 1,
  });
  newRatings.set(comparison.modelB, {
    modelId: comparison.modelB,
    rating: newRatingB,
    comparisons: ratingB.comparisons + 1,
  });

  return newRatings;
}

/**
 * Apply multiple comparisons to update ratings
 */
export function applyComparisons(
  initialRatings: Map<string, EloRating>,
  comparisons: Comparison[]
): Map<string, EloRating> {
  let ratings = initialRatings;
  for (const comparison of comparisons) {
    ratings = updateEloRatings(ratings, comparison);
  }
  return ratings;
}

/**
 * Rank models by Elo rating
 */
export function rankModelsByElo(
  models: Model[],
  ratings: Map<string, EloRating>
): Array<Model & { eloRating: number; comparisons: number }> {
  return models
    .map((model) => {
      const rating = ratings.get(model.id) || {
        modelId: model.id,
        rating: INITIAL_RATING,
        comparisons: 0,
      };
      return {
        ...model,
        eloRating: rating.rating,
        comparisons: rating.comparisons,
      };
    })
    .sort((a, b) => b.eloRating - a.eloRating);
}



