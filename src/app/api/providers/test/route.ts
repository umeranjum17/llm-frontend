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
function validateExternalUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

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

/**
 * Categorizes error types based on HTTP status code
 */
function categorizeError(statusCode: number): {
  errorType: string;
  suggestion: string;
} {
  if (statusCode === 401 || statusCode === 403) {
    return {
      errorType: "auth_error",
      suggestion: "Please check that your API key is valid and active",
    };
  }
  if (statusCode === 429) {
    return {
      errorType: "rate_limit",
      suggestion: "Please wait a moment and try again",
    };
  }
  if (statusCode >= 500) {
    return {
      errorType: "provider_error",
      suggestion: "The provider's servers are experiencing issues. Please try again in a few moments",
    };
  }
  return {
    errorType: "unknown_error",
    suggestion: "Please check your API key and try again",
  };
}

/**
 * Gets the provider display name for user-facing messages
 */
function getProviderName(providerId: string): string {
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    openrouter: "OpenRouter",
    openai: "OpenAI",
  };
  return names[providerId] || providerId;
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

  const startTime = Date.now();
  const providerName = getProviderName(providerId);

  // Create AbortController with 10 second timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 10000);

  try {
    if (resolved.kind === "anthropic") {
      if (resolved.apiKeyRequired && !apiKey) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Missing API key",
            errorType: "missing_key",
            suggestion: "Please provide your Anthropic API key",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const upstream = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!upstream.ok) {
        const details = await upstream.text().catch(() => "");
        const { errorType, suggestion } = categorizeError(upstream.status);

        return new Response(
          JSON.stringify({
            ok: false,
            error: `Authentication failed`,
            errorType,
            statusCode: upstream.status,
            details,
            suggestion,
            provider: providerId,
            providerName,
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          provider: providerId,
          providerName,
          responseTime,
          testedAt: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const effectiveBaseUrl =
      resolved.baseUrl || (resolved.id === "openai" ? "https://api.openai.com/v1" : undefined);
    if (!effectiveBaseUrl) {
      return new Response(JSON.stringify({ error: "Missing baseUrl" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // SSRF protection: validate custom URLs
    if (baseUrl) {
      const ssrfError = validateExternalUrl(effectiveBaseUrl);
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
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      const { errorType, suggestion } = categorizeError(upstream.status);

      return new Response(
        JSON.stringify({
          ok: false,
          error: `Authentication failed`,
          errorType,
          statusCode: upstream.status,
          details,
          suggestion,
          provider: providerId,
          providerName,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        provider: providerId,
        providerName,
        responseTime,
        testedAt: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (e instanceof Error && e.name === "AbortError") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Request timeout",
          errorType: "timeout",
          suggestion: `Couldn't reach ${providerName}'s servers within 10 seconds. Please check your connection and try again`,
          provider: providerId,
          providerName,
        }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }

    // Handle network errors
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "Request failed",
        errorType: "network_error",
        suggestion: `Couldn't connect to ${providerName}'s servers. Please check your internet connection and try again`,
        provider: providerId,
        providerName,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

