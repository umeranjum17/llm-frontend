import { z } from "zod";

export const runtime = "nodejs";

type Cached = { fetchedAt: number; value: unknown };
const CACHE_TTL_MS = 60 * 60_000; // 1 hour
let cache: Cached | null = null;

const OpenRouterModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  context_length: z.number().optional(),
  top_provider: z
    .object({
      max_completion_tokens: z.number().optional(),
    })
    .optional(),
  architecture: z
    .object({
      modality: z.string().optional(), // e.g. "text", "text+image"
    })
    .optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
});

const OpenRouterModelsResponseSchema = z.object({
  data: z.array(OpenRouterModelSchema),
});

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseUsdPer1M(value: string | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function deriveProvider(modelId: string) {
  const prefix = modelId.split("/")[0] || "unknown";
  return titleCase(prefix);
}

function deriveCategories(opts: { supportsVision: boolean; supportsReasoning: boolean; price: number }) {
  const categories: string[] = ["balanced"];
  if (opts.supportsVision) categories.push("vision");
  if (opts.supportsReasoning) categories.push("reasoning");
  if (opts.price <= 0.05) categories.push("cheap");
  return categories;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";

  if (!refresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return new Response(JSON.stringify(cache.value), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { "Content-Type": "application/json" },
    // Let Next handle its own caching; we do app-level caching above.
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: "Failed to fetch models", status: upstream.status, details: text }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const json = await upstream.json();
  const parsed = OpenRouterModelsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Unexpected models response", details: parsed.error.flatten() }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const models = parsed.data.data
    .map((m) => {
      const modality = (m.architecture?.modality || "").toLowerCase();
      const supportsVision = modality.includes("image");
      const supportsReasoning = m.id.includes("/o1") || /reason/i.test(m.name || "");

      const inputCost = parseUsdPer1M(m.pricing?.prompt);
      const outputCost = parseUsdPer1M(m.pricing?.completion);

      return {
        id: m.id,
        name: m.name || m.id,
        provider: deriveProvider(m.id),
        contextLength: m.context_length || 0,
        inputCost,
        outputCost,
        category: deriveCategories({ supportsVision, supportsReasoning, price: inputCost + outputCost }),
        supportsVision,
        supportsReasoning,
        description: m.description,
        maxCompletionTokens: m.top_provider?.max_completion_tokens,
      };
    })
    .filter((m) => !!m.id);

  const payload = { fetchedAt: Date.now(), models };
  cache = { fetchedAt: Date.now(), value: payload };

  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}

