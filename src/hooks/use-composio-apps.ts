"use client";

/**
 * DEPRECATED: This hook is a compatibility wrapper around useComposioStore.
 * New code should use useComposioStore directly.
 *
 * This wrapper maintains backwards compatibility for existing consumers
 * while the codebase migrates to the Zustand store.
 */

import { useCallback, useMemo } from "react";
import { useComposioStore, type ComposioToolkit } from "@/stores/composio-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useShallow } from "zustand/react/shallow";

export type { ComposioToolkit };

export function useComposioApps() {
  // Get API key from secure store
  const composioKey = useApiKeysStore((s) => s.getKeyForProvider("composio"));
  const addKey = useApiKeysStore((s) => s.addKey);
  const removeKey = useApiKeysStore((s) => s.removeKey);

  const apiKey = composioKey?.key || null;

  // Get state from Composio store
  // Use useShallow for arrays to prevent unnecessary re-renders
  const toolkits = useComposioStore(useShallow((s) => s.toolkits));
  const enabledToolkitKeys = useComposioStore(useShallow((s) => s.enabledToolkitKeys));
  const isLoading = useComposioStore((s) => s.isLoading);
  const isLoadingToolkits = useComposioStore((s) => s.isLoadingToolkits);
  const error = useComposioStore((s) => s.error);
  const mcpUrl = useComposioStore((s) => s.mcpUrl);
  const mcpHeaders = useComposioStore((s) => s.mcpHeaders);
  const connectingToolkit = useComposioStore((s) => s.connectingToolkit);

  // Get actions from store
  const storeToggleToolkit = useComposioStore((s) => s.toggleToolkit);
  const storeFetchToolkits = useComposioStore((s) => s.fetchToolkits);
  const storeFetchConnectionStatus = useComposioStore((s) => s.fetchConnectionStatus);
  const storeCreateSession = useComposioStore((s) => s.createSession);
  const storeAuthorize = useComposioStore((s) => s.authorize);
  const storeReset = useComposioStore((s) => s.reset);

  // Wrap actions to inject API key
  const toggleToolkit = useCallback((toolkitKey: string) => {
    storeToggleToolkit(toolkitKey);
  }, [storeToggleToolkit]);

  const fetchToolkits = useCallback(async () => {
    if (!apiKey) return;
    await storeFetchToolkits(apiKey);
  }, [apiKey, storeFetchToolkits]);

  const fetchConnectionStatus = useCallback(async () => {
    if (!apiKey) return;
    await storeFetchConnectionStatus(apiKey);
  }, [apiKey, storeFetchConnectionStatus]);

  const createSession = useCallback(async () => {
    if (!apiKey) return null;
    return storeCreateSession(apiKey);
  }, [apiKey, storeCreateSession]);

  const authorize = useCallback(async (toolkit: string) => {
    if (!apiKey) return null;
    return storeAuthorize(apiKey, toolkit);
  }, [apiKey, storeAuthorize]);

  // API key management
  const setApiKey = useCallback(async (newApiKey: string) => {
    if (composioKey) {
      await removeKey(composioKey.id);
    }
    await addKey("composio", newApiKey, "Composio");
    storeReset();
  }, [addKey, removeKey, composioKey, storeReset]);

  const removeApiKey = useCallback(async () => {
    if (composioKey) {
      await removeKey(composioKey.id);
    }
    storeReset();
  }, [removeKey, composioKey, storeReset]);

  // MCP server reset
  const resetMcpServers = useCallback(async () => {
    storeReset();
    if (apiKey && enabledToolkitKeys.length > 0) {
      await storeCreateSession(apiKey);
    }
  }, [apiKey, enabledToolkitKeys.length, storeReset, storeCreateSession]);

  return {
    // Config
    apiKey,
    hasApiKey: !!apiKey,
    setApiKey,
    removeApiKey,

    // Toolkits - return all toolkits with isConnected/isEnabled status
    toolkits,
    toggleToolkit,
    enabledCount: enabledToolkitKeys.length,

    // Session
    mcpUrl,
    mcpHeaders,
    createSession,

    // Actions
    authorize,
    fetchToolkits,
    fetchConnectionStatus,
    resetMcpServers,
    connectingToolkit,

    // State
    isLoading,
    isLoadingToolkits,
    error,
  };
}
