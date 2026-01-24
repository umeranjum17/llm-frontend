"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { db } from "@/lib/db/schema";
import { McpManager } from "@/lib/mcp/mcp-manager";

// Types
export interface ComposioToolkit {
  key: string;
  name: string;
  description?: string;
  logo?: string;
  toolsCount?: number;
  noAuth?: boolean;
  isConnected: boolean;
  isEnabled: boolean;
  connectedAccountId?: string;
}

interface ComposioState {
  // Core state
  toolkits: ComposioToolkit[];
  enabledToolkitKeys: string[];
  isLoading: boolean;
  isLoadingToolkits: boolean;
  error: string | null;

  // Session state
  mcpUrl: string | null;
  mcpHeaders: Record<string, string> | null;
  sessionExpiresAt: number | null;

  // Connection state
  connectingToolkit: string | null;

  // Computed (derived in selectors)
  _lastFetchedAt: number | null;
}

interface ComposioActions {
  // Toolkit management
  setToolkits: (toolkits: ComposioToolkit[]) => void;
  toggleToolkit: (toolkitKey: string) => void;
  enableAllToolkits: () => void;
  disableAllToolkits: () => void;

  // Fetching
  fetchToolkits: (apiKey: string) => Promise<void>;
  fetchConnectionStatus: (apiKey: string) => Promise<void>;

  // Session
  createSession: (apiKey: string) => Promise<{ url: string; headers: Record<string, string> } | null>;
  clearSession: () => void;

  // OAuth
  authorize: (apiKey: string, toolkitKey: string) => Promise<string | null>;
  setConnectingToolkit: (key: string | null) => void;

  // Errors
  setError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

// Constants
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours
const TOOLKITS_CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours
const API_TIMEOUT_MS = 10000; // 10 seconds

// In-flight request deduplication
let inFlightFetchToolkits: Promise<void> | null = null;
let inFlightFetchConnectionStatus: Promise<void> | null = null;
let inFlightCreateSession: Promise<{ url: string; headers: Record<string, string> } | null> | null = null;

// Fallback icons
const ICON_MAP: Record<string, string> = {
  gmail: "https://cdn.simpleicons.org/gmail",
  github: "https://cdn.simpleicons.org/github/white",
  slack: "https://cdn.simpleicons.org/slack",
  notion: "https://cdn.simpleicons.org/notion/white",
  linear: "https://cdn.simpleicons.org/linear",
  "google-calendar": "https://cdn.simpleicons.org/googlecalendar",
  "google-sheets": "https://cdn.simpleicons.org/googlesheets",
  "google-drive": "https://cdn.simpleicons.org/googledrive",
  googledrive: "https://cdn.simpleicons.org/googledrive",
  googlecalendar: "https://cdn.simpleicons.org/googlecalendar",
  googlesheets: "https://cdn.simpleicons.org/googlesheets",
  twitter: "https://cdn.simpleicons.org/x/white",
  discord: "https://cdn.simpleicons.org/discord",
  jira: "https://cdn.simpleicons.org/jira",
  youtube: "https://cdn.simpleicons.org/youtube",
  reddit: "https://cdn.simpleicons.org/reddit",
  trello: "https://cdn.simpleicons.org/trello",
  dropbox: "https://cdn.simpleicons.org/dropbox",
  zoom: "https://cdn.simpleicons.org/zoom",
  linkedin: "https://cdn.simpleicons.org/linkedin",
  spotify: "https://cdn.simpleicons.org/spotify",
  stripe: "https://cdn.simpleicons.org/stripe",
};

function getIconUrl(key: string, logo?: string | null): string | undefined {
  if (logo) return logo;
  const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, "");
  return ICON_MAP[key] || ICON_MAP[normalizedKey] || ICON_MAP[key.toLowerCase()];
}

const initialState: ComposioState = {
  toolkits: [],
  enabledToolkitKeys: [],
  isLoading: false,
  isLoadingToolkits: false,
  error: null,
  mcpUrl: null,
  mcpHeaders: null,
  sessionExpiresAt: null,
  connectingToolkit: null,
  _lastFetchedAt: null,
};

export const useComposioStore = create<ComposioState & ComposioActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setToolkits: (toolkits) => {
        const { enabledToolkitKeys } = get();
        const enabledSet = new Set(enabledToolkitKeys);
        set({
          toolkits: toolkits.map((t) => ({
            ...t,
            logo: t.logo || getIconUrl(t.key),
            isEnabled: enabledSet.has(t.key),
          })),
        });
      },

      toggleToolkit: (toolkitKey) => {
        const { enabledToolkitKeys, toolkits } = get();
        const toolkit = toolkits.find((t) => t.key === toolkitKey);

        // Can't enable if not connected and requires auth
        if (toolkit && !toolkit.isConnected && !toolkit.noAuth && !enabledToolkitKeys.includes(toolkitKey)) {
          console.warn(`[Composio] Cannot enable ${toolkitKey} - not connected`);
          return;
        }

        const newEnabled = enabledToolkitKeys.includes(toolkitKey)
          ? enabledToolkitKeys.filter((k) => k !== toolkitKey)
          : [...enabledToolkitKeys, toolkitKey];

        set({
          enabledToolkitKeys: newEnabled,
          toolkits: toolkits.map((t) => ({
            ...t,
            isEnabled: newEnabled.includes(t.key),
          })),
          // Invalidate session when toolkits change
          mcpUrl: null,
          mcpHeaders: null,
          sessionExpiresAt: null,
        });

        // Invalidate MCP tools cache
        try {
          McpManager.getInstance().invalidateToolsCache();
        } catch {
          // Manager may not be initialized
        }
      },

      enableAllToolkits: () => {
        const { toolkits } = get();
        const connectedKeys = toolkits
          .filter((t) => t.isConnected || t.noAuth)
          .map((t) => t.key);

        set({
          enabledToolkitKeys: connectedKeys,
          toolkits: toolkits.map((t) => ({
            ...t,
            isEnabled: connectedKeys.includes(t.key),
          })),
          mcpUrl: null,
          mcpHeaders: null,
          sessionExpiresAt: null,
        });
      },

      disableAllToolkits: () => {
        const { toolkits } = get();
        set({
          enabledToolkitKeys: [],
          toolkits: toolkits.map((t) => ({ ...t, isEnabled: false })),
          mcpUrl: null,
          mcpHeaders: null,
          sessionExpiresAt: null,
        });

        // Clean up MCP server
        db.mcpServers.delete("composio-consolidated").catch(() => {});
      },

      fetchToolkits: async (apiKey) => {
        const { _lastFetchedAt, toolkits: existingToolkits } = get();

        // Skip if recently fetched
        if (_lastFetchedAt && Date.now() - _lastFetchedAt < TOOLKITS_CACHE_TTL && existingToolkits.length > 0) {
          return;
        }

        // Deduplicate in-flight requests
        if (inFlightFetchToolkits) {
          return inFlightFetchToolkits;
        }

        set({ isLoadingToolkits: true, error: null });

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS);

        const fetchPromise = (async () => {
          try {
            const response = await fetch("/api/composio/available-toolkits", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-composio-key": apiKey,
              },
              signal: abortController.signal,
            });

            if (!response.ok) throw new Error("Failed to fetch toolkits");

            const { toolkits } = await response.json();
            const { enabledToolkitKeys } = get();
            const enabledSet = new Set(enabledToolkitKeys);

            // Preserve existing connection status
            const existingConnectionStatus = new Map(
              existingToolkits.map((t) => [t.key, { isConnected: t.isConnected, connectedAccountId: t.connectedAccountId }])
            );

            const processed: ComposioToolkit[] = toolkits.map((t: any) => {
              const existing = existingConnectionStatus.get(t.key);
              return {
                key: t.key,
                name: t.name,
                description: t.description,
                logo: t.logo || getIconUrl(t.key),
                toolsCount: t.toolsCount,
                noAuth: t.noAuth,
                isConnected: existing?.isConnected ?? false,
                isEnabled: enabledSet.has(t.key),
                connectedAccountId: existing?.connectedAccountId,
              };
            });

            set({
              toolkits: processed,
              _lastFetchedAt: Date.now(),
              isLoadingToolkits: false,
              error: null,
            });
          } catch (err) {
            const message = err instanceof Error
              ? (err.name === "AbortError" ? "Request timed out" : err.message)
              : "Failed to fetch toolkits";
            console.error("[Composio] Failed to fetch toolkits:", err);
            set({ isLoadingToolkits: false, error: message });
          } finally {
            clearTimeout(timeoutId);
            inFlightFetchToolkits = null;
          }
        })();

        inFlightFetchToolkits = fetchPromise;
        return fetchPromise;
      },

      fetchConnectionStatus: async (apiKey) => {
        // Deduplicate in-flight requests
        if (inFlightFetchConnectionStatus) {
          return inFlightFetchConnectionStatus;
        }

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS);

        const fetchPromise = (async () => {
          try {
            const response = await fetch("/api/composio/toolkits", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-composio-key": apiKey,
              },
              body: JSON.stringify({ userId: "default" }),
              signal: abortController.signal,
            });

            if (!response.ok) {
              throw new Error("Failed to fetch connection status");
            }

            const { connectionMap } = await response.json();
            if (!connectionMap) return;

            // Build connected map
            const connectedMap = new Map<string, string>();
            for (const [key, value] of Object.entries(connectionMap)) {
              const status = ((value as any).status || "").toUpperCase();
              const accountId = (value as any).id;
              if (status === "ACTIVE" && accountId) {
                connectedMap.set(key.toLowerCase(), accountId);
              }
            }

            const { toolkits } = get();
            set({
              toolkits: toolkits.map((t) => {
                // Try multiple variations to match
                const variations = [
                  t.key,
                  t.key.toLowerCase(),
                  t.key.replace(/-/g, "_"),
                  t.key.replace(/_/g, "-"),
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
              }),
              error: null,
            });
          } catch (err) {
            const message = err instanceof Error
              ? (err.name === "AbortError" ? "Connection status request timed out" : err.message)
              : "Failed to fetch connection status";
            console.error("[Composio] Failed to fetch connection status:", err);
            set({ error: message });
          } finally {
            clearTimeout(timeoutId);
            inFlightFetchConnectionStatus = null;
          }
        })();

        inFlightFetchConnectionStatus = fetchPromise;
        return fetchPromise;
      },

      createSession: async (apiKey) => {
        const { enabledToolkitKeys, toolkits, mcpUrl, mcpHeaders, sessionExpiresAt } = get();

        // Return cached session if valid
        if (mcpUrl && mcpHeaders && sessionExpiresAt && Date.now() < sessionExpiresAt) {
          return { url: mcpUrl, headers: mcpHeaders };
        }

        if (enabledToolkitKeys.length === 0) {
          // Clean up if no toolkits
          db.mcpServers.delete("composio-consolidated").catch(() => {});
          return null;
        }

        // Deduplicate in-flight requests
        if (inFlightCreateSession) {
          return inFlightCreateSession;
        }

        set({ isLoading: true, error: null });

        inFlightCreateSession = (async () => {
          try {
            // Collect connected account IDs
            const connectedAccounts: Record<string, string> = {};
            for (const key of enabledToolkitKeys) {
              const toolkit = toolkits.find((t) => t.key === key);
              if (toolkit?.connectedAccountId) {
                connectedAccounts[key] = toolkit.connectedAccountId;
              }
            }

            const response = await fetch("/api/composio/session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-composio-key": apiKey,
              },
              body: JSON.stringify({
                userId: "default",
                toolkits: enabledToolkitKeys,
                connectedAccounts: Object.keys(connectedAccounts).length > 0 ? connectedAccounts : undefined,
              }),
            });

            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.error || "Failed to create session");
            }

            const { mcp } = await response.json();
            const now = Date.now();
            const expiresAt = now + SESSION_TTL_MS;

            set({
              mcpUrl: mcp.url,
              mcpHeaders: mcp.headers,
              sessionExpiresAt: expiresAt,
              isLoading: false,
            });

            // Save to IndexedDB for MCP manager
            const enabledToolkitNames = enabledToolkitKeys
              .map((key) => toolkits.find((t) => t.key === key)?.name || key)
              .join(", ");

            const composioToolkits = toolkits
              .filter((t) => t.isConnected || t.noAuth)
              .map((t) => ({
                key: t.key,
                name: t.name,
                logo: t.logo,
                isEnabled: enabledToolkitKeys.includes(t.key),
              }));

            await db.mcpServers.put({
              id: "composio-consolidated",
              name: `Composio (${enabledToolkitKeys.length} apps)`,
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
              sessionExpiresAt: expiresAt,
              createdAt: now,
              updatedAt: now,
            } as any);

            return mcp;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            set({ error: message, isLoading: false });
            return null;
          } finally {
            inFlightCreateSession = null;
          }
        })();

        return inFlightCreateSession;
      },

      clearSession: () => {
        set({
          mcpUrl: null,
          mcpHeaders: null,
          sessionExpiresAt: null,
        });
        db.mcpServers.delete("composio-consolidated").catch(() => {});
      },

      authorize: async (apiKey, toolkitKey) => {
        set({ connectingToolkit: toolkitKey, error: null });

        try {
          const response = await fetch("/api/composio/authorize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-composio-key": apiKey,
            },
            body: JSON.stringify({
              userId: "default",
              toolkit: toolkitKey,
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

          set({ connectingToolkit: null });
          return redirectUrl;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Authorization failed";
          set({ error: message, connectingToolkit: null });
          throw err;
        }
      },

      setConnectingToolkit: (key) => set({ connectingToolkit: key }),

      setError: (error) => set({ error }),

      reset: () => {
        set(initialState);
        db.mcpServers.delete("composio-consolidated").catch(() => {});
      },
    }),
    {
      name: "composio-store",
      // Custom storage to only persist enabledToolkitKeys
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            const data = JSON.parse(str);
            return {
              state: {
                enabledToolkitKeys: data.state?.enabledToolkitKeys || [],
              },
            };
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                enabledToolkitKeys: value.state.enabledToolkitKeys || [],
              },
            })
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

// Selectors for common derived state
export const selectEnabledToolkits = (state: ComposioState) =>
  state.toolkits.filter((t) => t.isEnabled);

export const selectConnectedToolkits = (state: ComposioState) =>
  state.toolkits.filter((t) => t.isConnected || t.noAuth);

export const selectEnabledCount = (state: ComposioState) =>
  state.enabledToolkitKeys.length;

export const selectConnectedCount = (state: ComposioState) =>
  state.toolkits.filter((t) => t.isConnected).length;

export const selectHasValidSession = (state: ComposioState) =>
  !!(state.mcpUrl && state.sessionExpiresAt && Date.now() < state.sessionExpiresAt);
