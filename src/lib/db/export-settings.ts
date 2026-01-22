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

export const SETTINGS_EXPORT_VERSION = 2; // Bumped for plaintext API key export

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
  };
}

/**
 * Exports all user settings and configurations from the database
 * Excludes conversation data (chats, messages) and built-in items
 * API keys are decrypted before export so they can be re-encrypted on import
 */
export async function exportAllSettings(): Promise<SettingsExport> {
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
    db.apiKeys.toArray(),
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

  // Decrypt API keys for export (they'll be re-encrypted on import with new device secret)
  const apiKeys: ApiKey[] = [];
  for (const key of rawApiKeys) {
    try {
      if (isEncryptedKey(key.key)) {
        const decryptedKey = await decryptApiKey(key.key);
        apiKeys.push({ ...key, key: decryptedKey });
      } else {
        // Already plaintext (legacy)
        apiKeys.push(key);
      }
    } catch (error) {
      // Skip keys that can't be decrypted (orphaned keys)
      console.warn(`[Export] Skipping undecryptable key for ${key.provider}`);
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
