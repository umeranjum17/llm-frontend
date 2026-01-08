import { getModelAggregator } from "@/lib/models/model-aggregator";
import { getRankingService } from "@/lib/models/ranking/ranking-service";

export const runtime = "nodejs";

type Cached = { fetchedAt: number; value: unknown };
const CACHE_TTL_MS = 60 * 60_000; // 1 hour
let cache: Cached | null = null;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const provider = url.searchParams.get("provider"); // Optional provider filter

  // Check cache
  if (!refresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cache.value), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const aggregator = getModelAggregator();
    const rankingService = getRankingService();

    // Get API keys from request headers (optional)
    // In production, these could come from user session or environment
    const apiKeys: Record<string, string> = {};
    const openRouterKey = req.headers.get("x-openrouter-key");
    if (openRouterKey) apiKeys.openrouter = openRouterKey;

    // Fetch models from all providers
    const providers = provider ? [provider] : undefined;
    const models = await aggregator.fetchAllProviders({
      providers,
      apiKeys,
      useOpenRouter: true,
    });

    // Calculate rankings (rank models by weighted score)
    const rankedModels = rankingService.rankModels(models);

    const payload = { fetchedAt: Date.now(), models: rankedModels };
    cache = { fetchedAt: Date.now(), value: payload };

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    return new Response(
      JSON.stringify({ error: message, details: String(error) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
