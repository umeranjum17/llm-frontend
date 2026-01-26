import { db } from "./schema";
import type {
  ApiKey,
  McpServer,
  Agent,
  Prompt,
  UserSettings,
  ModelFavorite,
  ModelAlias,
  ParameterPreset,
  Tag,
  TagRule,
} from "./schema";
import { decryptApiKey, isEncryptedKey } from "@/lib/crypto/api-key-crypto";
import { isVaultEncryptedKey } from "@/lib/crypto/api-key-vault";

export const SETTINGS_EXPORT_VERSION = 2; // Bumped for plaintext API key export

export interface ExportAllSettingsOptions {
  /** When false (default), API keys are excluded to keep them local-only. */
  includeApiKeys?: boolean;
}

export interface SettingsExport {
  version: number;
  exportedAt: number;
  appVersion?: string;
  data: {
    apiKeys: ApiKey[];
    mcpServers: McpServer[];
    agents: Agent[];
    prompts: Prompt[];
    settings: UserSettings | null;
    modelFavorites: ModelFavorite[];
    modelAliases: ModelAlias[];
    parameterPresets: ParameterPreset[];
    tags: Tag[];
    tagRules: TagRule[];
    // Composio preferences (non-sensitive) - API key is now in apiKeys array
    composioPreferences?: { userId: string; enabledToolkits: string[] } | null;
    // Legacy field for backwards compatibility (old exports)
    composioConfig?: { apiKey: string } | null;
  };
}

export class ExportSettingsError extends Error {
  code: "VAULT_LOCKED" | "KEY_DECRYPT_FAILED";

  constructor(message: string, code: ExportSettingsError["code"]) {
    super(message);
    this.name = "ExportSettingsError";
    this.code = code;
  }
}

/**
 * Exports all user settings and configurations from the database
 * Excludes conversation data (chats, messages) and built-in items
 * API keys are excluded by default to keep them local-only (opt-in via options)
 */
export async function exportAllSettings(
  options: ExportAllSettingsOptions = {}
): Promise<SettingsExport> {
  const includeApiKeys = options.includeApiKeys === true;

  // Fetch all relevant data from Dexie tables
  const [
    rawApiKeys,
    mcpServers,
    allAgents,
    allPrompts,
    settings,
    modelFavorites,
    modelAliases,
    parameterPresets,
    tags,
    tagRules,
  ] = await Promise.all([
    includeApiKeys ? db.apiKeys.toArray() : Promise.resolve([] as ApiKey[]),
    db.mcpServers.toArray(),
    db.agents.toArray(),
    db.prompts.toArray(),
    db.settings.get("default"),
    db.modelFavorites.toArray(),
    db.modelAliases.toArray(),
    db.parameterPresets.toArray(),
    db.tags.toArray(),
    db.tagRules.toArray(),
  ]);

  const apiKeys: ApiKey[] = [];
  if (includeApiKeys) {
    const vaultKeyIds = rawApiKeys.filter((key) => isVaultEncryptedKey(key.key)).map((key) => key.id);
    const hasVaultKeys = vaultKeyIds.length > 0;
    let vaultKeyById: Map<string, string> | null = null;

    if (hasVaultKeys) {
      if (typeof window === "undefined") {
        throw new ExportSettingsError(
          "Vault-protected API keys require an unlocked session to export.",
          "VAULT_LOCKED"
        );
      }

      const { useApiKeysStore } = await import("@/stores/api-keys-store");
      const state = useApiKeysStore.getState();
      if (!state.isLoaded) {
        await state.loadKeys();
      }

      const vaultReady = state.vault.meta && state.vault.isUnlocked;
      if (!vaultReady) {
        throw new ExportSettingsError(
          "Unlock the API key vault to include keys in this export.",
          "VAULT_LOCKED"
        );
      }

      vaultKeyById = new Map(state.keys.map((key) => [key.id, key.key]));
    }

    // Decrypt API keys for export (they'll be re-encrypted on import with new device secret)
    for (const key of rawApiKeys) {
      try {
        if (isVaultEncryptedKey(key.key)) {
          const decryptedKey = vaultKeyById?.get(key.id);
          if (!decryptedKey) {
            throw new ExportSettingsError(
              "Vault is unlocked but a protected key could not be read. Try unlocking again.",
              "VAULT_LOCKED"
            );
          }
          apiKeys.push({ ...key, key: decryptedKey });
          continue;
        }

        if (isEncryptedKey(key.key)) {
          const decryptedKey = await decryptApiKey(key.key);
          apiKeys.push({ ...key, key: decryptedKey });
          continue;
        }

        // Already plaintext (legacy)
        apiKeys.push(key);
      } catch (error) {
        if (error instanceof ExportSettingsError) {
          throw error;
        }

        const message =
          error instanceof Error ? error.message : `Failed to decrypt API key for ${key.provider}`;
        throw new ExportSettingsError(message, "KEY_DECRYPT_FAILED");
      }
    }

    if (apiKeys.length !== rawApiKeys.length) {
      throw new ExportSettingsError(
        "Some API keys could not be exported. Unlock the vault and try again.",
        "KEY_DECRYPT_FAILED"
      );
    }
  }

  // Filter out built-in items - only export user-created content
  const customAgents = allAgents.filter((agent) => !agent.isBuiltIn);
  const customPrompts = allPrompts.filter((prompt) => !prompt.isBuiltIn);

  // Remove cached tools from MCP servers (they'll be re-fetched)
  const cleanMcpServers = mcpServers.map((server) => ({
    ...server,
    tools: undefined,
    status: undefined,
    error: undefined,
    lastConnectedAt: undefined,
  }));

  // Get Composio preferences from localStorage (non-sensitive data)
  // Note: Composio API key is now in the encrypted apiKeys array
  let composioPreferences: { userId: string; enabledToolkits: string[] } | null = null;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("composio_preferences");
      if (stored) {
        const prefs = JSON.parse(stored);
        composioPreferences = {
          userId: prefs.userId || "default",
          enabledToolkits: prefs.enabledToolkits || [],
        };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: Date.now(),
    data: {
      apiKeys,
      mcpServers: cleanMcpServers,
      agents: customAgents,
      prompts: customPrompts,
      settings: settings || null,
      modelFavorites,
      modelAliases,
      parameterPresets,
      tags,
      tagRules,
      composioPreferences,
    },
  };
}

/**
 * Creates a downloadable file from encrypted settings
 */
export function downloadSettingsFile(encryptedData: string, filename?: string) {
  const blob = new Blob([encryptedData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `lumina-settings-${new Date().toISOString().split("T")[0]}.lumina`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Returns a summary of what will be exported
 */
export async function getExportSummary(): Promise<{
  apiKeys: number;
  mcpServers: number;
  agents: number;
  prompts: number;
  modelFavorites: number;
  modelAliases: number;
  parameterPresets: number;
  tags: number;
  tagRules: number;
  hasSettings: boolean;
}> {
  const [
    apiKeysCount,
    mcpServersCount,
    agents,
    prompts,
    settings,
    modelFavoritesCount,
    modelAliasesCount,
    parameterPresetsCount,
    tagsCount,
    tagRulesCount,
  ] = await Promise.all([
    db.apiKeys.count(),
    db.mcpServers.count(),
    db.agents.toArray(),
    db.prompts.toArray(),
    db.settings.get("default"),
    db.modelFavorites.count(),
    db.modelAliases.count(),
    db.parameterPresets.count(),
    db.tags.count(),
    db.tagRules.count(),
  ]);

  return {
    apiKeys: apiKeysCount,
    mcpServers: mcpServersCount,
    agents: agents.filter((a) => !a.isBuiltIn).length,
    prompts: prompts.filter((p) => !p.isBuiltIn).length,
    modelFavorites: modelFavoritesCount,
    modelAliases: modelAliasesCount,
    parameterPresets: parameterPresetsCount,
    tags: tagsCount,
    tagRules: tagRulesCount,
    hasSettings: !!settings,
  };
}
