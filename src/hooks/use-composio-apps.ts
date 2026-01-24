"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { db } from "@/lib/db/schema";
import { McpManager } from "@/lib/mcp/mcp-manager";
import { useApiKeysStore } from "@/stores/api-keys-store";

export interface ComposioToolkit {
  key: string;
  name: string;
  description?: string;
  logo?: string;
  categories?: { slug: string; name: string }[];
  toolsCount?: number;
  noAuth?: boolean;
  authSchemes?: string[];
  isConnected: boolean;
  isEnabled: boolean;
  connectedAccountId?: string;
}

// Composio preferences stored in localStorage (non-sensitive)
interface ComposioPreferences {
  userId: string;
  enabledToolkits: string[];
}

// Fallback icons from Simple Icons CDN
const ICON_MAP: Record<string, string> = {
  gmail: "https://cdn.simpleicons.org/gmail",
  github: "https://cdn.simpleicons.org/github/white",
  slack: "https://cdn.simpleicons.org/slack",
  notion: "https://cdn.simpleicons.org/notion/white",
  linear: "https://cdn.simpleicons.org/linear",
  "google-calendar": "https://cdn.simpleicons.org/googlecalendar",
  "google-sheets": "https://cdn.simpleicons.org/googlesheets",
  "google-drive": "https://cdn.simpleicons.org/googledrive",
  "googledrive": "https://cdn.simpleicons.org/googledrive",
  "googlecalendar": "https://cdn.simpleicons.org/googlecalendar",
  "googlesheets": "https://cdn.simpleicons.org/googlesheets",
  twitter: "https://cdn.simpleicons.org/x/white",
  discord: "https://cdn.simpleicons.org/discord",
  jira: "https://cdn.simpleicons.org/jira",
  hubspot: "https://cdn.simpleicons.org/hubspot",
  airtable: "https://cdn.simpleicons.org/airtable",
  figma: "https://cdn.simpleicons.org/figma",
  youtube: "https://cdn.simpleicons.org/youtube",
  reddit: "https://cdn.simpleicons.org/reddit",
  trello: "https://cdn.simpleicons.org/trello",
  asana: "https://cdn.simpleicons.org/asana",
  dropbox: "https://cdn.simpleicons.org/dropbox",
  zoom: "https://cdn.simpleicons.org/zoom",
  hackernews: "https://cdn.simpleicons.org/ycombinator",
  hacker_news: "https://cdn.simpleicons.org/ycombinator",
  search: "https://cdn.simpleicons.org/google",
  composio_search: "https://cdn.simpleicons.org/google",
  composio: "https://composio.dev/favicon.ico",
  microsoft: "https://cdn.simpleicons.org/microsoft",
  outlook: "https://cdn.simpleicons.org/microsoftoutlook",
  teams: "https://cdn.simpleicons.org/microsoftteams",
  instagram: "https://cdn.simpleicons.org/instagram",
  whatsapp: "https://cdn.simpleicons.org/whatsapp",
  tiktok: "https://cdn.simpleicons.org/tiktok/white",
  linkedin: "https://cdn.simpleicons.org/linkedin",
  spotify: "https://cdn.simpleicons.org/spotify",
  stripe: "https://cdn.simpleicons.org/stripe",
  shopify: "https://cdn.simpleicons.org/shopify",
  zendesk: "https://cdn.simpleicons.org/zendesk",
  intercom: "https://cdn.simpleicons.org/intercom",
  salesforce: "https://cdn.simpleicons.org/salesforce",
  mailchimp: "https://cdn.simpleicons.org/mailchimp",
  twilio: "https://cdn.simpleicons.org/twilio",
  sendgrid: "https://cdn.simpleicons.org/sendgrid",
  aws: "https://cdn.simpleicons.org/amazonaws",
  gcp: "https://cdn.simpleicons.org/googlecloud",
  azure: "https://cdn.simpleicons.org/microsoftazure",
};

const PREFERENCES_KEY = "composio_preferences";
const TOOLKITS_CACHE_KEY = "composio_toolkits_cache";

/**
 * PERFORMANCE CRITICAL - Cache TTLs
 *
 * These values were tuned to balance freshness vs performance:
 * - Toolkits rarely change, so 4 hours is safe
 * - Sessions are expensive to create (API call + DB write), so 2 hours saves resources
 * - Composio docs say 10-minute expiry is only for INCOMPLETE connection attempts,
 *   not active sessions, so longer TTL is safe
 *
 * DO NOT reduce these without good reason - it will cause unnecessary API calls
 * and slow down the app, especially on "New Chat" which was previously blocked.
 */
const TOOLKITS_CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours - toolkits rarely change
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours - active sessions last longer than incomplete ones

// NOTE: Using "default" for userId is secure because Composio isolates ALL data by API key.
// Each user has their own API key → their own isolated data.
// entityId is for sub-user isolation within a single API key (SaaS scenario).
// For personal/BYOK use, "default" is the standard approach.

function getPreferences(): ComposioPreferences | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(PREFERENCES_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return {
      userId: parsed.userId || "default",
      enabledToolkits: Array.isArray(parsed.enabledToolkits) ? parsed.enabledToolkits : [],
    };
  } catch {
    return null;
  }
}

function savePreferences(prefs: ComposioPreferences) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
}

function clearPreferences() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFERENCES_KEY);
  localStorage.removeItem(TOOLKITS_CACHE_KEY);
}

// Get cached toolkits
function getCachedToolkits(): ComposioToolkit[] | null {
  if (typeof window === "undefined") return null;
  const cached = localStorage.getItem(TOOLKITS_CACHE_KEY);
  if (!cached) return null;
  try {
    const { toolkits, timestamp } = JSON.parse(cached);
    // Validate that toolkits is an array
    if (!Array.isArray(toolkits)) return null;
    if (Date.now() - timestamp < TOOLKITS_CACHE_TTL) {
      return toolkits;
    }
    return null;
  } catch {
    return null;
  }
}

// Save toolkits to cache
function cacheToolkits(toolkits: ComposioToolkit[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    TOOLKITS_CACHE_KEY,
    JSON.stringify({ toolkits, timestamp: Date.now() })
  );
}

// Batch cleanup of Composio MCP servers
async function cleanupComposioServers(keepIds?: string[]) {
  const allServers = await db.mcpServers.toArray();
  const keepSet = new Set(keepIds || []);
  const idsToDelete = allServers
    .filter((s) => s.id.startsWith("composio-"))
    .filter((s) => !keepSet.has(s.id))
    .map((s) => s.id);

  if (idsToDelete.length > 0) {
    await db.mcpServers.bulkDelete(idsToDelete);
  }
}

// Clear ALL MCP servers (for resetting to clean state)
async function clearAllMcpServers() {
  await db.mcpServers.clear();
}

// Get icon URL for a toolkit
function getIconUrl(key: string, logo?: string | null): string | undefined {
  if (logo) return logo;
  const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, "");
  return (
    ICON_MAP[key] ||
    ICON_MAP[normalizedKey] ||
    ICON_MAP[key.toLowerCase()] ||
    undefined
  );
}

// Check if cached session is still valid
async function getCachedSession(): Promise<{
  url: string;
  headers: Record<string, string>;
  enabledToolkits: string[];
  expiresAt: number;
} | null> {
  try {
    const existingServer = await db.mcpServers.get("composio-consolidated");
    if (!existingServer) return null;

    const serverAny = existingServer as any;
    const sessionExpiresAt = serverAny.sessionExpiresAt;

    // Check if session is expired
    if (!sessionExpiresAt || Date.now() > sessionExpiresAt) {
      return null;
    }

    // Extract enabled toolkits from the cached server
    const cachedToolkits = serverAny.composioToolkits || [];
    const enabledToolkits = cachedToolkits
      .filter((t: any) => t.isEnabled)
      .map((t: any) => t.key);

    return {
      url: existingServer.url,
      headers: existingServer.headers || {},
      enabledToolkits,
      expiresAt: sessionExpiresAt,
    };
  } catch {
    return null;
  }
}

// Check if toolkits have changed
function toolkitsChanged(current: string[], cached: string[]): boolean {
  if (current.length !== cached.length) return true;
  const sortedCurrent = [...current].sort();
  const sortedCached = [...cached].sort();
  return sortedCurrent.some((t, i) => t !== sortedCached[i]);
}

export function useComposioApps() {
  const [preferences, setPreferences] = useState<ComposioPreferences | null>(null);
  const [availableToolkits, setAvailableToolkits] = useState<ComposioToolkit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingToolkits, setIsLoadingToolkits] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);
  const [mcpHeaders, setMcpHeaders] = useState<Record<string, string> | null>(null);
  const [connectionStatusReady, setConnectionStatusReady] = useState(false);
  const fetchedRef = useRef(false);
  const connectionStatusFetchedRef = useRef(false);
  const sessionCreationInProgressRef = useRef(false);
  const sessionLoadedRef = useRef(false);

  // Get Composio API key from encrypted store
  const composioKey = useApiKeysStore((s) => s.getKeyForProvider("composio"));
  const addKey = useApiKeysStore((s) => s.addKey);
  const removeKey = useApiKeysStore((s) => s.removeKey);
  const keysLoaded = useApiKeysStore((s) => s.isLoaded);

  const apiKey = composioKey?.key || null;

  // Load preferences on mount and clean up legacy entries
  useEffect(() => {
    let prefs = getPreferences();

    // Migrate to "default" userId for better compatibility with existing connections
    if (prefs && prefs.userId !== "default") {
      prefs = { ...prefs, userId: "default" };
      savePreferences(prefs);

      // Clear existing session since entityId changed
      (async () => {
        try {
          await db.mcpServers.delete("composio-consolidated");
        } catch {
          // Ignore
        }
      })();
    }

    if (prefs) {
      setPreferences(prefs);
    } else {
      // Initialize default preferences
      setPreferences({ userId: "default", enabledToolkits: [] });
    }

    // Load cached toolkits initially
    const cached = getCachedToolkits();
    if (cached) {
      const enabledSet = new Set(prefs?.enabledToolkits || []);
      setAvailableToolkits(
        cached.map((t) => ({
          ...t,
          isEnabled: enabledSet.has(t.key),
        }))
      );
    }

    // Clean up legacy entries
    (async () => {
      try {
        await db.mcpServers.delete("composio-tool-router");
      } catch {
        // Ignore
      }
    })();

    // Migrate from old localStorage API key to encrypted store
    migrateFromLocalStorage();
  }, []);

  // Migrate old localStorage config to encrypted store
  const migrateFromLocalStorage = useCallback(async () => {
    if (typeof window === "undefined") return;

    const oldConfig = localStorage.getItem("composio_config");
    if (!oldConfig) return;

    try {
      const parsed = JSON.parse(oldConfig);
      if (parsed.apiKey && !composioKey) {
        // Migrate API key to encrypted store
        await addKey("composio", parsed.apiKey, "Composio");

        // Keep preferences separate
        const prefs: ComposioPreferences = {
          userId: parsed.userId || "default",
          enabledToolkits: Array.isArray(parsed.enabledToolkits) ? parsed.enabledToolkits : [],
        };
        savePreferences(prefs);
        setPreferences(prefs);
      }

      // Remove old config
      localStorage.removeItem("composio_config");
    } catch {
      // Ignore migration errors
    }
  }, [addKey, composioKey]);

  // Fetch available toolkits from Composio API
  const fetchAvailableToolkits = useCallback(async () => {
    if (!apiKey) return;

    setIsLoadingToolkits(true);
    try {
      const response = await fetch("/api/composio/available-toolkits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-composio-key": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch toolkits");
      }

      const { toolkits } = await response.json();
      const enabledSet = new Set(preferences?.enabledToolkits || []);

      // Preserve existing connection status
      setAvailableToolkits((prev) => {
        const existingConnectionStatus = new Map(
          prev.map((t) => [t.key, t.isConnected])
        );

        const processed: ComposioToolkit[] = toolkits.map((t: any) => ({
          key: t.key,
          name: t.name,
          description: t.description,
          logo: t.logo || getIconUrl(t.key),
          categories: t.categories,
          toolsCount: t.toolsCount,
          noAuth: t.noAuth,
          authSchemes: t.authSchemes,
          // Preserve existing connection status if available
          isConnected: existingConnectionStatus.get(t.key) ?? false,
          isEnabled: enabledSet.has(t.key),
        }));

        cacheToolkits(processed);
        return processed;
      });
    } catch (err) {
      console.error("Failed to fetch available toolkits:", err);
    } finally {
      setIsLoadingToolkits(false);
    }
  }, [apiKey, preferences?.enabledToolkits]);

  /**
   * PERFORMANCE CRITICAL - Lazy Session Loading
   *
   * Load cached session on mount (non-blocking) - reuse existing valid session.
   * This allows the session to be available immediately without blocking render.
   *
   * The session is stored in IndexedDB with a TTL (SESSION_TTL_MS).
   * If valid, we reuse it. If expired, components will trigger createSession() when needed.
   */
  useEffect(() => {
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;

    // Load cached session in background - DO NOT await
    getCachedSession().then((cached) => {
      if (cached) {
        setMcpUrl(cached.url);
        setMcpHeaders(cached.headers);
      }
    }).catch(() => {});
  }, []);

  /**
   * PERFORMANCE CRITICAL - No Auto-Fetch on Mount
   *
   * Previously, this hook auto-fetched toolkits and connection status on mount.
   * This BLOCKED the entire app because:
   * 1. useComposioApps() is used by tool-quick-toggle.tsx
   * 2. tool-quick-toggle.tsx renders in every chat view
   * 3. Network calls blocked the React render cycle
   *
   * FIX: Components now explicitly call fetchToolkits() when needed:
   * - Settings page: fetches on mount (user expects to wait)
   * - Tool toggle dialog: fetches when opened (lazy load)
   *
   * DO NOT add auto-fetch back - it will break "New Chat" responsiveness.
   */

  // Update enabled status when preferences change
  useEffect(() => {
    if (preferences?.enabledToolkits) {
      const enabledSet = new Set(preferences.enabledToolkits);
      setAvailableToolkits((prev) =>
        prev.map((t) => ({
          ...t,
          isEnabled: enabledSet.has(t.key),
        }))
      );
    }
  }, [preferences?.enabledToolkits]);

  // Set API key (stores encrypted in IndexedDB)
  const setApiKey = useCallback(async (newApiKey: string) => {
    // Remove old key first if exists
    if (composioKey) {
      await removeKey(composioKey.id);
    }

    // Add new key (encrypted)
    await addKey("composio", newApiKey, "Composio");

    // Reset preferences
    const newPrefs: ComposioPreferences = {
      userId: "default",
      enabledToolkits: [],
    };
    savePreferences(newPrefs);
    setPreferences(newPrefs);
    setMcpUrl(null);
    setMcpHeaders(null);
    fetchedRef.current = false;
    connectionStatusFetchedRef.current = false;
    setConnectionStatusReady(false);

    // Clean up old Composio MCP servers
    try {
      await cleanupComposioServers();
    } catch {
      // Ignore cleanup errors
    }
  }, [addKey, removeKey, composioKey]);

  // Remove API key
  const removeApiKeyHandler = useCallback(async () => {
    if (composioKey) {
      await removeKey(composioKey.id);
    }
    clearPreferences();
    setPreferences(null);
    setMcpUrl(null);
    setMcpHeaders(null);
    setAvailableToolkits([]);
    fetchedRef.current = false;
    connectionStatusFetchedRef.current = false;
    setConnectionStatusReady(false);

    // Remove ALL Composio MCP servers from database
    try {
      await cleanupComposioServers();
    } catch {
      // Ignore if not exists
    }
  }, [removeKey, composioKey]);

  // Toggle toolkit enabled state
  const toggleToolkit = useCallback(
    async (toolkitKey: string) => {
      if (!preferences) return;

      const enabledSet = new Set(preferences.enabledToolkits);
      const isEnabling = !enabledSet.has(toolkitKey);

      // Check if toolkit is connected before enabling
      if (isEnabling) {
        const toolkit = availableToolkits.find(t => t.key === toolkitKey);
        if (toolkit && !toolkit.isConnected && !toolkit.noAuth) {
          console.warn(`[Composio] Cannot enable ${toolkitKey} - not connected`);
          return;
        }
        enabledSet.add(toolkitKey);
      } else {
        enabledSet.delete(toolkitKey);
      }

      // If no toolkits left, clean up the consolidated server
      if (enabledSet.size === 0) {
        try {
          await db.mcpServers.delete("composio-consolidated");
        } catch {
          // Ignore
        }
      }

      const newPrefs = {
        ...preferences,
        enabledToolkits: Array.from(enabledSet),
      };
      savePreferences(newPrefs);
      setPreferences(newPrefs);

      // Mark session as needing refresh (toolkits changed)
      setMcpUrl(null);
      setMcpHeaders(null);

      // Invalidate MCP tools cache so new tools are fetched
      try {
        McpManager.getInstance().invalidateToolsCache();
      } catch {
        // Manager may not be initialized yet
      }
    },
    [preferences, availableToolkits]
  );

  // Create a session with enabled toolkits - SMART: reuses valid cached sessions
  const createSession = useCallback(async () => {
    if (!apiKey || !preferences) return null;

    // Prevent concurrent session creation
    if (sessionCreationInProgressRef.current) {
      return null;
    }

    // Clean up legacy entries first
    try {
      await db.mcpServers.delete("composio-tool-router");
    } catch {
      // Ignore
    }

    if (!preferences.enabledToolkits?.length) {
      // No toolkits enabled, clean up
      try {
        await cleanupComposioServers();
      } catch {
        // Ignore
      }
      return null;
    }

    // SMART SESSION MANAGEMENT: Check if we have a valid cached session
    const cachedSession = await getCachedSession();
    if (cachedSession && !toolkitsChanged(preferences.enabledToolkits, cachedSession.enabledToolkits)) {
      // Session is still valid and toolkits haven't changed - reuse it!
      setMcpUrl(cachedSession.url);
      setMcpHeaders(cachedSession.headers);
      return { url: cachedSession.url, headers: cachedSession.headers };
    }

    sessionCreationInProgressRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // Collect connected account IDs for enabled toolkits
      const connectedAccounts: Record<string, string> = {};
      for (const toolkitKey of preferences.enabledToolkits) {
        const toolkit = availableToolkits.find((t) => t.key === toolkitKey);
        if (toolkit?.connectedAccountId) {
          connectedAccounts[toolkitKey] = toolkit.connectedAccountId;
        }
      }

      const hasConnectedAccounts = Object.keys(connectedAccounts).length > 0;

      const response = await fetch("/api/composio/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-composio-key": apiKey,
        },
        body: JSON.stringify({
          userId: preferences.userId,
          toolkits: preferences.enabledToolkits,
          connectedAccounts: hasConnectedAccounts ? connectedAccounts : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create session");
      }

      const { mcp } = await response.json();
      setMcpUrl(mcp.url);
      setMcpHeaders(mcp.headers);

      const now = Date.now();

      // Build toolkit metadata for the UI
      const composioToolkits = availableToolkits
        .filter((t) => t.isConnected || t.noAuth)
        .map((t) => ({
          key: t.key,
          name: t.name,
          logo: t.logo,
          isEnabled: preferences.enabledToolkits.includes(t.key),
        }));

      // Build toolkit names for display
      const enabledToolkitNames = preferences.enabledToolkits
        .map((key) => {
          const toolkit = availableToolkits.find((t) => t.key === key);
          return toolkit?.name || key;
        })
        .join(", ");

      // Create consolidated MCP server entry with session TTL
      const consolidatedServer = {
        id: "composio-consolidated",
        name: `Composio (${preferences.enabledToolkits.length} apps)`,
        url: mcp.url,
        headers: mcp.headers,
        description: `Connected apps: ${enabledToolkitNames}`,
        enabled: true,
        status: "connected",
        type: "http",
        collection: "custom",
        logoUrl: "https://composio.dev/favicon.ico",
        category: "composio",
        composioToolkits,
        sessionExpiresAt: now + SESSION_TTL_MS,
        createdAt: now,
        updatedAt: now,
      };

      // Save and cleanup
      await Promise.all([
        db.mcpServers.put(consolidatedServer as any),
        cleanupComposioServers(["composio-consolidated"]),
      ]);

      return mcp;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setIsLoading(false);
      sessionCreationInProgressRef.current = false;
    }
  }, [apiKey, preferences, availableToolkits]);

  // Fetch toolkits with connection status
  const fetchConnectionStatus = useCallback(async () => {
    if (!apiKey || !preferences) return;

    try {
      const response = await fetch("/api/composio/toolkits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-composio-key": apiKey,
        },
        body: JSON.stringify({ userId: preferences.userId }),
      });

      if (!response.ok) return;

      const data = await response.json();
      const { connectionMap } = data;

      if (!connectionMap) return;

      // Build a map of connected toolkit keys to their account IDs
      const connectedMap = new Map<string, string>();
      for (const [key, value] of Object.entries(connectionMap)) {
        const status = ((value as any).status || "").toUpperCase();
        const accountId = (value as any).id;
        if (status === "ACTIVE" && accountId) {
          connectedMap.set(key.toLowerCase(), accountId);
        }
      }

      setAvailableToolkits((prev) => {
        const updated = prev.map((t) => {
          // Try multiple variations to match connection status
          const variations = [
            t.key,
            t.key.toLowerCase(),
            t.name,
            t.name.toLowerCase(),
            t.key.replace(/-/g, "_"),
            t.key.replace(/_/g, "-"),
            t.name.replace(/ /g, "_").toLowerCase(),
            t.name.replace(/ /g, "-").toLowerCase(),
          ];

          let connectedAccountId: string | undefined;
          for (const v of variations) {
            if (connectedMap.has(v)) {
              connectedAccountId = connectedMap.get(v);
              break;
            }
          }

          return {
            ...t,
            isConnected: !!connectedAccountId,
            connectedAccountId,
          };
        });

        cacheToolkits(updated);
        return updated;
      });

      setConnectionStatusReady(true);
    } catch (err) {
      console.error("[Composio] Failed to fetch connection status:", err);
      setConnectionStatusReady(true);
    }
  }, [apiKey, preferences]);

  // Authorize a toolkit (opens OAuth flow)
  const authorize = useCallback(
    async (toolkit: string) => {
      if (!apiKey || !preferences) return null;

      setConnectingToolkit(toolkit);
      setError(null);

      try {
        const response = await fetch("/api/composio/authorize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-composio-key": apiKey,
          },
          body: JSON.stringify({
            userId: preferences.userId,
            toolkit,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to authorize");
        }

        const { redirectUrl } = await response.json();

        if (redirectUrl) {
          window.open(redirectUrl, "_blank", "width=600,height=700");
        }

        return redirectUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authorization failed");
        throw err;
      } finally {
        setConnectingToolkit(null);
      }
    },
    [apiKey, preferences]
  );

  // Don't auto-fetch connection status - let components trigger fetch when needed
  // This prevents blocking the app on initial load

  // Don't auto-create session on mount - let components trigger it when needed
  // This prevents blocking the app on initial load and allows lazy initialization

  // Get toolkits with proper logo URLs (memoized)
  const toolkitsWithLogos = useMemo(
    () =>
      availableToolkits.map((t) => ({
        ...t,
        logo: t.logo || getIconUrl(t.key),
      })),
    [availableToolkits]
  );

  // Reset all MCP servers and re-sync with Composio
  const resetMcpServers = useCallback(async () => {
    await clearAllMcpServers();
    setMcpUrl(null);
    setMcpHeaders(null);
    // If we have enabled toolkits, recreate the session
    if (preferences?.enabledToolkits?.length) {
      await createSession();
    }
  }, [preferences?.enabledToolkits?.length, createSession]);

  return {
    // Config
    apiKey,
    hasApiKey: !!apiKey,
    setApiKey,
    removeApiKey: removeApiKeyHandler,

    // Toolkits
    toolkits: toolkitsWithLogos,
    toggleToolkit,
    enabledCount: preferences?.enabledToolkits.length || 0,

    // Session
    mcpUrl,
    mcpHeaders,
    createSession,

    // Actions
    authorize,
    fetchToolkits: useCallback(() => {
      connectionStatusFetchedRef.current = false;
      setConnectionStatusReady(false);
      return fetchAvailableToolkits();
    }, [fetchAvailableToolkits]),
    fetchConnectionStatus: useCallback(() => {
      connectionStatusFetchedRef.current = false;
      setConnectionStatusReady(false);
      setMcpUrl(null);
      return fetchConnectionStatus();
    }, [fetchConnectionStatus]),
    resetMcpServers,
    connectingToolkit,

    // State
    isLoading,
    isLoadingToolkits,
    error,
  };
}
