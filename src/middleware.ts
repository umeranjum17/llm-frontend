import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Simple in-memory rate limiter for API routes
 * For production with multiple instances, use Redis or similar
 */
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

// Rate limits per endpoint (requests per minute)
const RATE_LIMITS: Record<string, number> = {
  "/api/chat": 30,
  "/api/images": 10,
  "/api/composio/execute-tool": 60,
  "/api/agents/run": 20,
  "/api/providers/test": 10,
  "/api/memory": 30,
  "/api/composio": 30,
};

/**
 * Get client identifier for rate limiting
 * Uses X-Forwarded-For for proxied requests, falls back to X-Real-IP
 */
function getClientIdentifier(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

/**
 * Clean up expired rate limit entries periodically
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    if (now > entry.resetAt) {
      rateLimits.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Only rate limit API routes
  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Find matching rate limit config
  const matchedPath = Object.keys(RATE_LIMITS).find((p) => path.startsWith(p));
  if (!matchedPath) {
    return NextResponse.next();
  }

  const limit = RATE_LIMITS[matchedPath];
  const clientId = getClientIdentifier(request);
  const key = `${clientId}:${matchedPath}`;
  const now = Date.now();

  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    // First request or window expired - start new window
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else if (entry.count >= limit) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    return new NextResponse(
      JSON.stringify({
        error: "Rate limit exceeded. Please try again later.",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    );
  } else {
    // Increment counter
    entry.count++;
  }

  // Add rate limit headers to successful responses
  const response = NextResponse.next();
  const currentEntry = rateLimits.get(key);
  if (currentEntry) {
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set(
      "X-RateLimit-Remaining",
      String(Math.max(0, limit - currentEntry.count))
    );
    response.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(currentEntry.resetAt / 1000))
    );
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
