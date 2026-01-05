import { z } from "zod";
import { resolveProvider } from "@/lib/providers";

export const runtime = "nodejs";

const BodySchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { providerId, apiKey, baseUrl } = parsed.data;
  const resolved = resolveProvider(providerId, { baseUrl });
  if (!resolved) {
    return new Response(JSON.stringify({ error: "Unknown provider" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (resolved.kind === "anthropic") {
      if (resolved.apiKeyRequired && !apiKey) {
        return new Response(JSON.stringify({ error: "Missing API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const upstream = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
      });

      if (!upstream.ok) {
        const details = await upstream.text().catch(() => "");
        return new Response(
          JSON.stringify({ error: "Anthropic request failed", status: upstream.status, details }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const effectiveBaseUrl =
      resolved.baseUrl || (resolved.id === "openai" ? "https://api.openai.com/v1" : undefined);
    if (!effectiveBaseUrl) {
      return new Response(JSON.stringify({ error: "Missing baseUrl" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL("models", withTrailingSlash(effectiveBaseUrl));
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: "Provider request failed", status: upstream.status, details }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Request failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

