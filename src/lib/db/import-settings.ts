import { db } from "./schema";
import type { SettingsExport, SETTINGS_EXPORT_VERSION } from "./export-settings";
import { encryptApiKey, isEncryptedKey } from "@/lib/crypto/api-key-crypto";

export type ImportMode = "overwrite" | "merge" | "skip";

export interface ImportOptions {
  mode: ImportMode;
  importApiKeys: boolean;
  importMcpServers: boolean;
  importAgents: boolean;
  importPrompts: boolean;
  importSettings: boolean;
  importModelFavorites: boolean;
  importModelAliases: boolean;
  importParameterPresets: boolean;
  importTags: boolean;
  importTagRules: boolean;
}

export interface ImportResult {
  success: boolean;
  imported: {
    apiKeys: number;
    mcpServers: number;
    agents: number;
    prompts: number;
    settings: boolean;
    modelFavorites: number;
    modelAliases: number;
    parameterPresets: number;
    tags: number;
    tagRules: number;
  };
  skipped: {
    apiKeys: number;
    mcpServers: number;
    agents: number;
    prompts: number;
    modelFavorites: number;
    modelAliases: number;
    parameterPresets: number;
    tags: number;
    tagRules: number;
  };
  errors: string[];
}

const DEFAULT_OPTIONS: ImportOptions = {
  mode: "merge",
  importApiKeys: true,
  importMcpServers: true,
  importAgents: true,
  importPrompts: true,
  importSettings: true,
  importModelFavorites: true,
  importModelAliases: true,
  importParameterPresets: true,
  importTags: true,
  importTagRules: true,
};

/**
 * Validates the structure of imported settings data
 */
export function validateSettingsExport(data: unknown): data is SettingsExport {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "number") return false;
  if (typeof obj.exportedAt !== "number") return false;
  if (typeof obj.data !== "object" || obj.data === null) return false;

  const exportData = obj.data as Record<string, unknown>;

  // Check required arrays exist
  const requiredArrays = [
    "apiKeys",
    "mcpServers",
    "agents",
    "prompts",
    "modelFavorites",
    "modelAliases",
    "parameterPresets",
    "tags",
    "tagRules",
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(exportData[key])) return false;
  }

  return true;
}

/**
 * Imports settings into the database
 */
export async function importSettings(
  exportData: SettingsExport,
  options: Partial<ImportOptions> = {}
): Promise<ImportResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: ImportResult = {
    success: true,
    imported: {
      apiKeys: 0,
      mcpServers: 0,
      agents: 0,
      prompts: 0,
      settings: false,
      modelFavorites: 0,
      modelAliases: 0,
      parameterPresets: 0,
      tags: 0,
      tagRules: 0,
    },
    skipped: {
      apiKeys: 0,
      mcpServers: 0,
      agents: 0,
      prompts: 0,
      modelFavorites: 0,
      modelAliases: 0,
      parameterPresets: 0,
      tags: 0,
      tagRules: 0,
    },
    errors: [],
  };

  try {
    // Import API Keys
    // Keys from export are in plaintext (decrypted during export) and need to be
    // re-encrypted with this device's secret before storing
    if (opts.importApiKeys && exportData.data.apiKeys.length > 0) {
      for (const apiKey of exportData.data.apiKeys) {
        try {
          // Re-encrypt the API key with this device's secret
          // If key is already encrypted (old format export), try to use as-is
          const keyToStore = isEncryptedKey(apiKey.key)
            ? apiKey.key // Already encrypted (legacy export format)
            : await encryptApiKey(apiKey.key); // Encrypt plaintext key

          const encryptedApiKey = { ...apiKey, key: keyToStore };

          const existingById = await db.apiKeys.get(apiKey.id);
          const existingByProvider = await db.apiKeys
            .where("provider")
            .equals(apiKey.provider)
            .first();

          if (opts.mode === "overwrite") {
            // In overwrite mode, always replace existing (by ID or provider)
            if (existingByProvider && existingByProvider.id !== apiKey.id) {
              // Different ID but same provider - delete the old one first
              await db.apiKeys.delete(existingByProvider.id);
            }
            await db.apiKeys.put(encryptedApiKey);
            result.imported.apiKeys++;
          } else if (opts.mode === "merge") {
            // In merge mode, overwrite if same provider exists (regardless of ID)
            if (existingByProvider) {
              await db.apiKeys.put({ ...encryptedApiKey, id: existingByProvider.id });
              result.imported.apiKeys++;
            } else {
              await db.apiKeys.add(encryptedApiKey);
              result.imported.apiKeys++;
            }
          } else {
            // Skip mode - only add if no key for this provider exists
            if (!existingById && !existingByProvider) {
              await db.apiKeys.add(encryptedApiKey);
              result.imported.apiKeys++;
            } else {
              result.skipped.apiKeys++;
            }
          }
        } catch (e) {
          result.errors.push(`Failed to import API key: ${apiKey.provider}`);
        }
      }
    }

    // Import MCP Servers
    if (opts.importMcpServers && exportData.data.mcpServers.length > 0) {
      for (const server of exportData.data.mcpServers) {
        try {
          const existing = await db.mcpServers.get(server.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.mcpServers.put(server);
              result.imported.mcpServers++;
            } else if (opts.mode === "merge") {
              await db.mcpServers.put({ ...existing, ...server });
              result.imported.mcpServers++;
            } else {
              result.skipped.mcpServers++;
            }
          } else {
            await db.mcpServers.add(server);
            result.imported.mcpServers++;
          }
        } catch (e) {
          result.errors.push(`Failed to import MCP server: ${server.name}`);
        }
      }
    }

    // Import Agents (only non-built-in)
    if (opts.importAgents && exportData.data.agents.length > 0) {
      for (const agent of exportData.data.agents) {
        if (agent.isBuiltIn) continue; // Skip built-in agents
        try {
          const existing = await db.agents.get(agent.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.agents.put(agent);
              result.imported.agents++;
            } else if (opts.mode === "merge") {
              await db.agents.put({ ...existing, ...agent });
              result.imported.agents++;
            } else {
              result.skipped.agents++;
            }
          } else {
            await db.agents.add(agent);
            result.imported.agents++;
          }
        } catch (e) {
          result.errors.push(`Failed to import agent: ${agent.name}`);
        }
      }
    }

    // Import Prompts (only non-built-in)
    if (opts.importPrompts && exportData.data.prompts.length > 0) {
      for (const prompt of exportData.data.prompts) {
        if (prompt.isBuiltIn) continue; // Skip built-in prompts
        try {
          const existing = await db.prompts.get(prompt.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.prompts.put(prompt);
              result.imported.prompts++;
            } else if (opts.mode === "merge") {
              await db.prompts.put({ ...existing, ...prompt });
              result.imported.prompts++;
            } else {
              result.skipped.prompts++;
            }
          } else {
            await db.prompts.add(prompt);
            result.imported.prompts++;
          }
        } catch (e) {
          result.errors.push(`Failed to import prompt: ${prompt.title}`);
        }
      }
    }

    // Import Settings
    if (opts.importSettings && exportData.data.settings) {
      try {
        const existing = await db.settings.get("default");
        if (existing) {
          if (opts.mode === "overwrite") {
            await db.settings.put(exportData.data.settings);
            result.imported.settings = true;
          } else if (opts.mode === "merge") {
            // Merge settings, preferring imported values
            await db.settings.put({ ...existing, ...exportData.data.settings });
            result.imported.settings = true;
          }
          // Skip mode: don't import settings
        } else {
          await db.settings.add(exportData.data.settings);
          result.imported.settings = true;
        }
      } catch (e) {
        result.errors.push("Failed to import settings");
      }
    }

    // Import Model Favorites
    if (opts.importModelFavorites && exportData.data.modelFavorites.length > 0) {
      for (const favorite of exportData.data.modelFavorites) {
        try {
          const existing = await db.modelFavorites.get(favorite.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.modelFavorites.put(favorite);
              result.imported.modelFavorites++;
            } else if (opts.mode === "merge") {
              await db.modelFavorites.put({ ...existing, ...favorite });
              result.imported.modelFavorites++;
            } else {
              result.skipped.modelFavorites++;
            }
          } else {
            await db.modelFavorites.add(favorite);
            result.imported.modelFavorites++;
          }
        } catch (e) {
          result.errors.push(`Failed to import model favorite: ${favorite.id}`);
        }
      }
    }

    // Import Model Aliases
    if (opts.importModelAliases && exportData.data.modelAliases.length > 0) {
      for (const alias of exportData.data.modelAliases) {
        try {
          const existing = await db.modelAliases.get(alias.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.modelAliases.put(alias);
              result.imported.modelAliases++;
            } else if (opts.mode === "merge") {
              await db.modelAliases.put({ ...existing, ...alias });
              result.imported.modelAliases++;
            } else {
              result.skipped.modelAliases++;
            }
          } else {
            await db.modelAliases.add(alias);
            result.imported.modelAliases++;
          }
        } catch (e) {
          result.errors.push(`Failed to import model alias: ${alias.alias}`);
        }
      }
    }

    // Import Parameter Presets
    if (opts.importParameterPresets && exportData.data.parameterPresets.length > 0) {
      for (const preset of exportData.data.parameterPresets) {
        try {
          const existing = await db.parameterPresets.get(preset.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.parameterPresets.put(preset);
              result.imported.parameterPresets++;
            } else if (opts.mode === "merge") {
              await db.parameterPresets.put({ ...existing, ...preset });
              result.imported.parameterPresets++;
            } else {
              result.skipped.parameterPresets++;
            }
          } else {
            await db.parameterPresets.add(preset);
            result.imported.parameterPresets++;
          }
        } catch (e) {
          result.errors.push(`Failed to import parameter preset: ${preset.name}`);
        }
      }
    }

    // Import Tags
    if (opts.importTags && exportData.data.tags.length > 0) {
      for (const tag of exportData.data.tags) {
        try {
          const existing = await db.tags.get(tag.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.tags.put(tag);
              result.imported.tags++;
            } else if (opts.mode === "merge") {
              await db.tags.put({ ...existing, ...tag });
              result.imported.tags++;
            } else {
              result.skipped.tags++;
            }
          } else {
            await db.tags.add(tag);
            result.imported.tags++;
          }
        } catch (e) {
          result.errors.push(`Failed to import tag: ${tag.name}`);
        }
      }
    }

    // Import Tag Rules
    if (opts.importTagRules && exportData.data.tagRules.length > 0) {
      for (const rule of exportData.data.tagRules) {
        try {
          const existing = await db.tagRules.get(rule.id);
          if (existing) {
            if (opts.mode === "overwrite") {
              await db.tagRules.put(rule);
              result.imported.tagRules++;
            } else if (opts.mode === "merge") {
              await db.tagRules.put({ ...existing, ...rule });
              result.imported.tagRules++;
            } else {
              result.skipped.tagRules++;
            }
          } else {
            await db.tagRules.add(rule);
            result.imported.tagRules++;
          }
        } catch (e) {
          result.errors.push(`Failed to import tag rule: ${rule.pattern}`);
        }
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    return result;
  }
}

/**
 * Reads a file and returns its contents as a string
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * Returns a preview of what will be imported
 */
export function getImportPreview(exportData: SettingsExport): {
  apiKeys: number;
  mcpServers: number;
  agents: number;
  prompts: number;
  hasSettings: boolean;
  modelFavorites: number;
  modelAliases: number;
  parameterPresets: number;
  tags: number;
  tagRules: number;
  exportedAt: Date;
  version: number;
} {
  return {
    apiKeys: exportData.data.apiKeys.length,
    mcpServers: exportData.data.mcpServers.length,
    agents: exportData.data.agents.filter((a) => !a.isBuiltIn).length,
    prompts: exportData.data.prompts.filter((p) => !p.isBuiltIn).length,
    hasSettings: !!exportData.data.settings,
    modelFavorites: exportData.data.modelFavorites.length,
    modelAliases: exportData.data.modelAliases.length,
    parameterPresets: exportData.data.parameterPresets.length,
    tags: exportData.data.tags.length,
    tagRules: exportData.data.tagRules.length,
    exportedAt: new Date(exportData.exportedAt),
    version: exportData.version,
  };
}
