export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface WebSearchResponse {
  provider: "tavily" | "serper" | "brave" | "searxng" | "mock";
  query: string;
  results: SearchResult[];
  error?: string;
}

export type WebSearchProvider = WebSearchResponse["provider"];

export interface WebSearchConfig {
  provider?: WebSearchProvider;
  apiKey?: string;
  baseUrl?: string;
}

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { expiresAt: number; value: WebSearchResponse }>();

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

function clampResults(maxResults: number) {
  if (!Number.isFinite(maxResults)) return 5;
  return Math.max(1, Math.min(10, Math.floor(maxResults)));
}

function getCacheKey(
  provider: WebSearchProvider,
  query: string,
  maxResults: number,
  namespace: string = ""
) {
  return `${provider}:${namespace}:${maxResults}:${query.toLowerCase()}`;
}

function getCached(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  // Refresh insertion order (simple LRU).
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function setCached(key: string, value: WebSearchResponse) {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (!firstKey) break;
    cache.delete(firstKey);
  }
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number = 10_000
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderFromEnv(): WebSearchProvider {
  const explicit = (process.env.WEB_SEARCH_PROVIDER || "").toLowerCase();
  if (explicit === "tavily") return "tavily";
  if (explicit === "serper") return "serper";
  if (explicit === "brave") return "brave";
  if (explicit === "searxng") return "searxng";
  if (explicit === "mock") return "mock";

  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.SERPER_API_KEY) return "serper";
  if (process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY) return "brave";
  if (process.env.SEARXNG_BASE_URL) return "searxng";
  return "mock";
}

function sanitizeSnippet(text: string | undefined) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= 500) return normalized;
  return `${normalized.slice(0, 497)}...`;
}

function resolveConfig(config?: WebSearchConfig): {
  provider: WebSearchProvider;
  apiKey?: string;
  baseUrl?: string;
} {
  const provider = config?.provider || getProviderFromEnv();

  if (provider === "tavily") {
    return {
      provider,
      apiKey: config?.apiKey || process.env.TAVILY_API_KEY,
    };
  }

  if (provider === "serper") {
    return {
      provider,
      apiKey: config?.apiKey || process.env.SERPER_API_KEY,
    };
  }

  if (provider === "brave") {
    return {
      provider,
      apiKey:
        config?.apiKey || process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY,
    };
  }

  if (provider === "searxng") {
    return {
      provider,
      baseUrl: config?.baseUrl || process.env.SEARXNG_BASE_URL,
    };
  }

  return { provider: "mock" };
}

async function tavilySearch(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResult[]> {

  const data = await fetchJson<{
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      published_date?: string;
      publishedDate?: string;
    }>;
  }>("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
  });

  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: sanitizeSnippet(r.content),
      publishedDate: r.published_date || r.publishedDate,
    }))
    .filter((r) => r.title && r.url);
}

async function serperSearch(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResult[]> {

  const data = await fetchJson<{
    organic?: Array<{
      title?: string;
      link?: string;
      snippet?: string;
      date?: string;
    }>;
  }>("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
    }),
  });

  const results = Array.isArray(data.organic) ? data.organic : [];
  return results
    .map((r) => ({
      title: r.title || "",
      url: r.link || "",
      snippet: sanitizeSnippet(r.snippet),
      publishedDate: r.date,
    }))
    .filter((r) => r.title && r.url);
}

async function braveSearch(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResult[]> {

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query
  )}&count=${maxResults}`;

  const data = await fetchJson<{
    web?: {
      results?: Array<{
        title?: string;
        url?: string;
        description?: string;
        age?: string;
      }>;
    };
  }>(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  const results = Array.isArray(data.web?.results) ? data.web?.results : [];
  return results
    .map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: sanitizeSnippet(r.description),
      publishedDate: r.age,
    }))
    .filter((r) => r.title && r.url);
}

async function searxngSearch(
  query: string,
  maxResults: number,
  baseUrl: string
): Promise<SearchResult[]> {

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const url = `${normalizedBase}/search?q=${encodeURIComponent(
    query
  )}&format=json&language=en&categories=general`;

  const data = await fetchJson<{
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      publishedDate?: string;
      published_date?: string;
    }>;
  }>(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: sanitizeSnippet(r.content),
      publishedDate: r.publishedDate || r.published_date,
    }))
    .filter((r) => r.title && r.url);
}

function mockSearch(query: string, maxResults: number): SearchResult[] {
  // Dynamic mock responses based on query keywords (fallback when no provider is configured).
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes("weather")) {
    return [
      {
        title: "Weather Forecast - The Weather Channel",
        url: "https://weather.com/forecast",
        snippet:
          "Today's forecast: Sunny with a high of 75°F (24°C). Winds N at 10 to 15 mph. Tonight: Clear skies, low of 55°F.",
        publishedDate: new Date().toISOString(),
      },
      {
        title: "Local Weather Report",
        url: "https://accuweather.com/local",
        snippet:
          "Current conditions: Fair. Humidity 45%. UV Index: 5 (Moderate). Visibility: 10 miles.",
      },
    ].slice(0, maxResults);
  }

  if (lowerQuery.includes("apple") || lowerQuery.includes("stock")) {
    return [
      {
        title: "Apple Inc. (AAPL) Stock Price, News, Quote & History",
        url: "https://finance.yahoo.com/quote/AAPL",
        snippet:
          "Apple Inc. (AAPL) stock price, news, quote & history - Yahoo Finance. Current price: $185.92 +1.20 (+0.65%).",
        publishedDate: new Date().toISOString(),
      },
    ].slice(0, maxResults);
  }

  return [
    {
      title: `${query} - Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
      snippet: `General background on “${query}”.`,
    },
    {
      title: `Top 10 facts about ${query}`,
      url: `https://example.com/facts/${encodeURIComponent(query)}`,
      snippet: `A simulated result list for “${query}”.`,
    },
    {
      title: `Latest News: ${query}`,
      url: `https://news.example.com/${encodeURIComponent(query)}`,
      snippet: `A simulated news result for “${query}”.`,
      publishedDate: new Date().toISOString(),
    },
  ].slice(0, maxResults);
}

export async function webSearch(
  query: string,
  maxResults: number = 5,
  config?: WebSearchConfig
): Promise<WebSearchResponse> {
  const normalizedQuery = normalizeQuery(query);
  const clampedMaxResults = clampResults(maxResults);
  const { provider, apiKey, baseUrl } = resolveConfig(config);
  const cacheNamespace = provider === "searxng" && baseUrl ? baseUrl.replace(/\/+$/, "") : "";
  const key = getCacheKey(provider, normalizedQuery, clampedMaxResults, cacheNamespace);
  const cached = getCached(key);
  if (cached) return cached;

  try {
    if (!normalizedQuery) {
      throw new Error("Search query is empty");
    }

    let results: SearchResult[] = [];

    if (provider === "tavily") {
      if (!apiKey) throw new Error("Missing Tavily API key");
      results = await tavilySearch(normalizedQuery, clampedMaxResults, apiKey);
    } else if (provider === "serper") {
      if (!apiKey) throw new Error("Missing Serper API key");
      results = await serperSearch(normalizedQuery, clampedMaxResults, apiKey);
    } else if (provider === "brave") {
      if (!apiKey) throw new Error("Missing Brave Search API key");
      results = await braveSearch(normalizedQuery, clampedMaxResults, apiKey);
    } else if (provider === "searxng") {
      if (!baseUrl) throw new Error("Missing SearxNG base URL");
      results = await searxngSearch(normalizedQuery, clampedMaxResults, baseUrl);
    }
    else results = mockSearch(normalizedQuery, clampedMaxResults);

    const response: WebSearchResponse = {
      provider,
      query: normalizedQuery,
      results,
    };

    setCached(key, response);
    return response;
  } catch (error) {
    const response: WebSearchResponse = {
      provider,
      query: normalizedQuery,
      results: provider === "mock" ? mockSearch(normalizedQuery, clampedMaxResults) : [],
      error: error instanceof Error ? error.message : "Web search failed",
    };

    setCached(key, response);
    return response;
  }
}
