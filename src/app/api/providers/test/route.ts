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

/**
 * Validates that a URL is not pointing to internal/private networks
 * Returns error message if invalid, null if valid
 */
function validateExternalUrl(urlString: string, allowLocal: boolean = false): string | null {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Allow local providers if explicitly permitted (Ollama, LM Studio)
    if (allowLocal) {
      return null;
    }

    // Block internal network patterns
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
      /^0\./, // Current network
      /\.local$/i,
      /\.internal$/i,
      /^host\.docker\.internal$/i,
      /^\[::1\]$/, // IPv6 localhost
      /^\[fe80:/i, // IPv6 link-local
      /^\[fc/i, // IPv6 unique local
      /^\[fd/i, // IPv6 unique local
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return "Internal network addresses are not allowed for cloud providers";
      }
    }

    return null;
  } catch {
    return "Invalid URL format";
  }
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
    // Handle local providers (Ollama, LM Studio) - no API key needed
    if (providerId === "ollama" || providerId === "lmstudio") {
      const effectiveBaseUrl = baseUrl || resolved.baseUrl;
      if (!effectiveBaseUrl) {
        return new Response(JSON.stringify({ error: "Missing baseUrl" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // For Ollama, check /api/tags
      if (providerId === "ollama") {
        const ollamaUrl = effectiveBaseUrl.replace("/v1", "");
        const upstream = await fetch(`${ollamaUrl}/api/tags`, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });

        if (!upstream.ok) {
          return new Response(
            JSON.stringify({ error: "Ollama not available", status: upstream.status }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // For LM Studio, check /v1/models (OpenAI-compatible)
      const url = new URL("models", withTrailingSlash(effectiveBaseUrl));
      const upstream = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });

      if (!upstream.ok) {
        return new Response(
          JSON.stringify({ error: "LM Studio not available", status: upstream.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

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

    // SSRF protection: validate custom URLs for non-local providers
    if (baseUrl) {
      const ssrfError = validateExternalUrl(effectiveBaseUrl, false);
      if (ssrfError) {
        return new Response(JSON.stringify({ error: ssrfError }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
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

