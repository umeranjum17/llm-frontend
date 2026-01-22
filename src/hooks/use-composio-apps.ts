"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { db } from "@/lib/db/schema";
import { McpManager } from "@/lib/mcp/mcp-manager";

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

// Composio config stored in localStorage
interface ComposioConfig {
  apiKey: string;
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

const STORAGE_KEY = "composio_config";
const TOOLKITS_CACHE_KEY = "composio_toolkits_cache";
const TOOLKITS_CACHE_TTL = 1000 * 60 * 60; // 1 hour
const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes - sessions expire and need refresh

// NOTE: Using "default" for userId is secure because Composio isolates ALL data by API key.
// Each user has their own API key → their own isolated data.
// entityId is for sub-user isolation within a single API key (SaaS scenario).
// For personal/BYOK use, "default" is the standard approach.

function getConfig(): ComposioConfig | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    // Ensure required fields exist (handle malformed imports)
    if (!parsed.apiKey) return null;
    return {
      apiKey: parsed.apiKey,
      userId: parsed.userId || "default",
      enabledToolkits: Array.isArray(parsed.enabledToolkits) ? parsed.enabledToolkits : [],
    };
  } catch {
    return null;
  }
}

function saveConfig(config: ComposioConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function clearConfig() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(TOOLKITS_CACHE_KEY);
}

// Get cached toolkits
function getCachedToolkits(): ComposioToolkit[] | null {
  if (typeof window === "undefined") return null;
  const cached = localStorage.getItem(TOOLKITS_CACHE_KEY);
  if (!cached) return null;
  try {
    const { toolkits, timestamp } = JSON.parse(cached);
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

export function useComposioApps() {
  const [config, setConfig] = useState<ComposioConfig | null>(null);
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

  // Load config on mount and clean up legacy entries
  useEffect(() => {
    let loaded = getConfig();

    // Migrate to "default" userId for better compatibility with existing connections
    // This ensures connections created under "default" entityId are found
    if (loaded && loaded.userId !== "default") {
      loaded = { ...loaded, userId: "default" };
      saveConfig(loaded);

      // CRITICAL: Clear existing Composio session since entityId changed
      // Old session was created with wrong entityId and won't find connections
      (async () => {
        try {
          await db.mcpServers.delete("composio-consolidated");
        } catch {
          // Ignore
        }
      })();
    }

    if (loaded) {
      setConfig(loaded);
    }
    // Load cached toolkits initially
    const cached = getCachedToolkits();
    if (cached) {
      const enabledSet = new Set(loaded?.enabledToolkits || []);
      setAvailableToolkits(
        cached.map((t) => ({
          ...t,
          isEnabled: enabledSet.has(t.key),
        }))
      );
    }

    // Clean up legacy entries and check for expired sessions
    (async () => {
      try {
        await db.mcpServers.delete("composio-tool-router");

        // Check if current Composio session is expired
        const existingServer = await db.mcpServers.get("composio-consolidated");
        if (existingServer) {
          const sessionExpiresAt = (existingServer as any).sessionExpiresAt;
          if (sessionExpiresAt && Date.now() > sessionExpiresAt) {
            // Delete the expired entry so a new session gets created
            await db.mcpServers.delete("composio-consolidated");
          }
        }
      } catch {
        // Ignore
      }
    })();
  }, []);

  // Fetch available toolkits from Composio API
  const fetchAvailableToolkits = useCallback(async () => {
    if (!config?.apiKey) return;

    setIsLoadingToolkits(true);
    try {
      const response = await fetch("/api/composio/available-toolkits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-composio-key": config.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch toolkits");
      }

      const { toolkits } = await response.json();
      const enabledSet = new Set(config.enabledToolkits || []);

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
  }, [config?.apiKey, config?.enabledToolkits]);

  // Fetch toolkits when API key is available (connection status fetched separately below)
  useEffect(() => {
    if (config?.apiKey && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchAvailableToolkits();
    }
  }, [config?.apiKey, fetchAvailableToolkits]);

  // Update enabled status when config changes
  useEffect(() => {
    if (config?.enabledToolkits) {
      const enabledSet = new Set(config.enabledToolkits);
      setAvailableToolkits((prev) =>
        prev.map((t) => ({
          ...t,
          isEnabled: enabledSet.has(t.key),
        }))
      );
    }
  }, [config?.enabledToolkits]);

  // Set API key and create initial config
  const setApiKey = useCallback(async (apiKey: string) => {
    // Use "default" userId - Composio isolates data by API key, so this is safe
    const userId = "default";
    const newConfig: ComposioConfig = {
      apiKey,
      userId,
      enabledToolkits: [],
    };
    saveConfig(newConfig);
    setConfig(newConfig);
    setMcpUrl(null);
    fetchedRef.current = false;
    connectionStatusFetchedRef.current = false;
    setConnectionStatusReady(false);

    // Clean up ALL old Composio MCP servers (batch operation)
    try {
      await cleanupComposioServers();
    } catch {
      // Ignore cleanup errors
    }
  }, []);

  // Remove API key and clear config
  const removeApiKey = useCallback(async () => {
    clearConfig();
    setConfig(null);
    setMcpUrl(null);
    setMcpHeaders(null);
    setAvailableToolkits([]);
    fetchedRef.current = false;
    connectionStatusFetchedRef.current = false;
    setConnectionStatusReady(false);

    // Remove ALL Composio MCP servers from database (batch operation)
    try {
      await cleanupComposioServers();
    } catch {
      // Ignore if not exists
    }
  }, []);

  // Toggle toolkit enabled state
  const toggleToolkit = useCallback(
    async (toolkitKey: string) => {
      if (!config) return;

      const enabledSet = new Set(config.enabledToolkits);
      const isEnabling = !enabledSet.has(toolkitKey);

      // Check if toolkit is connected before enabling
      if (isEnabling) {
        const toolkit = availableToolkits.find(t => t.key === toolkitKey);
        if (toolkit && !toolkit.isConnected && !toolkit.noAuth) {
          console.warn(`[Composio] Cannot enable ${toolkitKey} - not connected`);
          return; // Don't enable if not connected
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

      const newConfig = {
        ...config,
        enabledToolkits: Array.from(enabledSet),
      };
      saveConfig(newConfig);
      setConfig(newConfig);
      setMcpUrl(null); // Reset session to recreate with new toolkits (new apps filter)
      setMcpHeaders(null);

      // Invalidate MCP tools cache so new tools are fetched
      try {
        McpManager.getInstance().invalidateToolsCache();
      } catch {
        // Manager may not be initialized yet
      }
    },
    [config, availableToolkits]
  );

  // Create a session with enabled toolkits and save a single consolidated MCP server entry
  // This is optimized: instead of creating one server per toolkit (which causes duplicate connections),
  // we create a single "Composio" server that serves all enabled toolkits via one session URL
  const createSession = useCallback(async () => {
    if (!config?.apiKey) return null;

    // Always clean up legacy entries first
    try {
      await db.mcpServers.delete("composio-tool-router");
    } catch {
      // Ignore
    }

    if (config.enabledToolkits.length === 0) {
      // No toolkits enabled, clean up any existing entries (batch)
      try {
        await cleanupComposioServers();
      } catch {
        // Ignore
      }
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Collect connected account IDs for enabled toolkits
      const connectedAccounts: Record<string, string> = {};
      for (const toolkitKey of config.enabledToolkits) {
        const toolkit = availableToolkits.find((t) => t.key === toolkitKey);
        if (toolkit?.connectedAccountId) {
          connectedAccounts[toolkitKey] = toolkit.connectedAccountId;
        }
      }

      const hasConnectedAccounts = Object.keys(connectedAccounts).length > 0;
      if (process.env.NODE_ENV === "development") {
      }

      const response = await fetch("/api/composio/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-composio-key": config.apiKey,
        },
        body: JSON.stringify({
          userId: config.userId,
          toolkits: config.enabledToolkits,
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

      // Build toolkit metadata for the UI (allows individual toolkit toggling)
      const composioToolkits = availableToolkits
        .filter((t) => t.isConnected || t.noAuth) // Only connected/no-auth toolkits can be enabled
        .map((t) => ({
          key: t.key,
          name: t.name,
          logo: t.logo,
          isEnabled: config.enabledToolkits.includes(t.key),
        }));

      // Build toolkit names for display
      const enabledToolkitNames = config.enabledToolkits
        .map((key) => {
          const toolkit = availableToolkits.find((t) => t.key === key);
          return toolkit?.name || key;
        })
        .join(", ");

      // Create a SINGLE consolidated MCP server entry for all Composio toolkits
      // This optimizes performance by:
      // 1. Single connection instead of N connections (one per toolkit)
      // 2. Single listTools() call instead of N calls
      // 3. The session already filters to only return tools for enabled toolkits
      // The composioToolkits field allows the UI to show individual toggles
      const consolidatedServer = {
        id: "composio-consolidated",
        name: `Composio (${config.enabledToolkits.length} apps)`,
        url: mcp.url,
        headers: mcp.headers,
        description: `Connected apps: ${enabledToolkitNames}`,
        enabled: true,
        status: "connected",
        type: "http",
        collection: "custom",
        logoUrl: "https://composio.dev/favicon.ico",
        category: "composio",
        composioToolkits, // Include toolkit metadata for individual toggling in UI
        sessionExpiresAt: now + SESSION_TTL_MS, // Session TTL for auto-refresh
        createdAt: now,
        updatedAt: now,
      };

      // Clean up old individual toolkit entries and add the consolidated one
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
    }
  }, [config, availableToolkits]);

  // Fetch toolkits with connection status
  const fetchConnectionStatus = useCallback(async () => {
    if (!config?.apiKey) return;

    try {
      const response = await fetch("/api/composio/toolkits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-composio-key": config.apiKey,
        },
        body: JSON.stringify({ userId: config.userId }),
      });

      if (!response.ok) return;

      const data = await response.json();
      const { connectionMap, debug } = data;

      if (process.env.NODE_ENV === "development" && debug) {
      }

      if (!connectionMap) return;

      // Build a map of connected toolkit keys to their account IDs (normalize to lowercase)
      const connectedMap = new Map<string, string>();
      for (const [key, value] of Object.entries(connectionMap)) {
        const status = ((value as any).status || "").toUpperCase();
        const accountId = (value as any).id;
        if (status === "ACTIVE" && accountId) {
          connectedMap.set(key.toLowerCase(), accountId);
        }
      }

      if (process.env.NODE_ENV === "development") {
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

          const isConnected = !!connectedAccountId;

          if (process.env.NODE_ENV === "development" && isConnected) {
          }

          return {
            ...t,
            isConnected,
            connectedAccountId,
          };
        });

        // Also update the cache with connection status
        cacheToolkits(updated);

        return updated;
      });

      // Mark connection status as ready
      setConnectionStatusReady(true);
    } catch (err) {
      console.error("[Composio] Failed to fetch connection status:", err);
      // Still mark as ready even on error so we don't block forever
      setConnectionStatusReady(true);
    }
  }, [config]);

  // Authorize a toolkit (opens OAuth flow)
  const authorize = useCallback(
    async (toolkit: string) => {
      if (!config?.apiKey) return null;

      setConnectingToolkit(toolkit);
      setError(null);

      try {
        const response = await fetch("/api/composio/authorize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-composio-key": config.apiKey,
          },
          body: JSON.stringify({
            userId: config.userId,
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
    [config]
  );

  // Fetch connection status when toolkits are loaded (only once per session)
  useEffect(() => {
    if (config?.apiKey && availableToolkits.length > 0 && !connectionStatusFetchedRef.current) {
      connectionStatusFetchedRef.current = true;
      fetchConnectionStatus();
    }
  }, [config?.apiKey, availableToolkits.length, fetchConnectionStatus]);

  // Create session when config changes (wait for connection status first)
  useEffect(() => {
    if (config?.apiKey && !mcpUrl && config.enabledToolkits.length > 0 && connectionStatusReady) {
      createSession();
    }
  }, [config?.apiKey, config?.enabledToolkits, mcpUrl, connectionStatusReady, createSession]);

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
    // If we have enabled toolkits, recreate the session
    if (config?.enabledToolkits.length) {
      await createSession();
    }
  }, [config?.enabledToolkits.length, createSession]);

  return {
    // Config
    apiKey: config?.apiKey || null,
    hasApiKey: !!config?.apiKey,
    setApiKey,
    removeApiKey,

    // Toolkits
    toolkits: toolkitsWithLogos,
    toggleToolkit,
    enabledCount: config?.enabledToolkits.length || 0,

    // Session
    mcpUrl,
    mcpHeaders,
    createSession,

    // Actions
    authorize,
    fetchToolkits: useCallback(() => {
      // Reset refs to allow re-fetching
      connectionStatusFetchedRef.current = false;
      setConnectionStatusReady(false);
      return fetchAvailableToolkits();
    }, [fetchAvailableToolkits]),
    fetchConnectionStatus: useCallback(() => {
      connectionStatusFetchedRef.current = false;
      setConnectionStatusReady(false);
      setMcpUrl(null); // Reset session so it recreates with fresh connection data
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
