/**
 * Centralized Table Registry
 *
 * Single source of truth for all database tables.
 * Adding a new table requires only updating this registry.
 *
 * Benefits:
 * - No more forgetting to add tables to migration.ts, backup-recovery.ts, or change-tracker.ts
 * - All table metadata in one place
 * - Type-safe table configuration
 */

export interface TableConfig {
  name: string;
  addedInVersion: number;
  /** Include in delta sync (tracked for changes) */
  sync: boolean;
  /** Include in corruption recovery backup */
  backup: boolean;
  /** Dexie index definition string */
  indexes: string;
}

/**
 * Master registry of all database tables.
 *
 * When adding a new table:
 * 1. Add entry here with appropriate version, sync, and backup flags
 * 2. Add TypeScript interface to schema.ts
 * 3. Add version(N).stores({...}) to schema.ts
 * 4. Increment DB_SCHEMA_VERSION in schema.ts
 *
 * That's it! No need to update migration.ts, backup-recovery.ts, or change-tracker.ts.
 */
export const TABLE_REGISTRY: TableConfig[] = [
  // Version 1 tables
  { name: "projects", addedInVersion: 1, sync: true, backup: true, indexes: "id, name, createdAt, updatedAt" },
  { name: "projectFiles", addedInVersion: 1, sync: true, backup: true, indexes: "id, projectId, name, createdAt" },
  { name: "chats", addedInVersion: 1, sync: true, backup: true, indexes: "id, projectId, title, summary, modelId, createdAt, updatedAt, pinned, favorite, folderId, order, [projectId+updatedAt]" },
  { name: "messages", addedInVersion: 1, sync: true, backup: true, indexes: "id, chatId, role, createdAt, parentId, rating, skillId, isPinned, summarizedIntoId, [chatId+createdAt]" },
  { name: "apiKeys", addedInVersion: 1, sync: true, backup: true, indexes: "id, provider, createdAt, baseUrl" },
  { name: "settings", addedInVersion: 1, sync: true, backup: true, indexes: "id" },
  { name: "modelFavorites", addedInVersion: 1, sync: true, backup: true, indexes: "id, category, pinnedOrder, lastUsed" },
  { name: "folders", addedInVersion: 1, sync: true, backup: true, indexes: "id, projectId, name, createdAt, order" },

  // Version 2 tables
  { name: "tags", addedInVersion: 2, sync: true, backup: true, indexes: "id, name, createdAt, usageCount" },
  { name: "tagRules", addedInVersion: 2, sync: true, backup: true, indexes: "id, tagId, enabled, createdAt" },
  { name: "parameterPresets", addedInVersion: 2, sync: true, backup: true, indexes: "id, name, createdAt, isDefault" },

  // Version 3 tables
  { name: "agents", addedInVersion: 3, sync: true, backup: true, indexes: "id, name, isBuiltIn, isActive, usageCount, updatedAt" },
  { name: "prompts", addedInVersion: 3, sync: true, backup: true, indexes: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt" },

  // Version 5 tables
  { name: "vectorDocuments", addedInVersion: 5, sync: false, backup: false, indexes: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId" },

  // Version 7 tables
  { name: "userMemories", addedInVersion: 7, sync: true, backup: true, indexes: "id, category, source, createdAt, isActive" },

  // Version 9 tables
  { name: "workflows", addedInVersion: 9, sync: true, backup: true, indexes: "id, name, createdAt, updatedAt" },

  // Version 12 tables
  { name: "modelAliases", addedInVersion: 12, sync: true, backup: true, indexes: "id, alias, updatedAt" },

  // Version 13 tables
  { name: "mcpServers", addedInVersion: 13, sync: true, backup: true, indexes: "id, enabled, createdAt" },

  // Version 14 tables
  { name: "skills", addedInVersion: 14, sync: true, backup: true, indexes: "id, name, category, isBuiltIn, isEnabled, isFavorite, usageCount, updatedAt" },
  { name: "skillEmbeddings", addedInVersion: 14, sync: true, backup: true, indexes: "skillId, modelId" },

  // Version 17 tables
  { name: "deviceSecrets", addedInVersion: 17, sync: false, backup: true, indexes: "id" },

  // Version 18 tables
  { name: "contextSummaries", addedInVersion: 18, sync: true, backup: true, indexes: "id, chatId, modelId, createdAt" },

  // Version 20 tables (delta sync internal tables)
  { name: "_pendingChanges", addedInVersion: 20, sync: false, backup: true, indexes: "id, timestamp, deviceId" },
  { name: "_syncMeta", addedInVersion: 20, sync: false, backup: true, indexes: "id" },

  // Version 27 tables (API key sync)
  { name: "syncedApiKeys", addedInVersion: 27, sync: false, backup: true, indexes: "id, provider, deviceId, version, updatedAt" },
];

/**
 * Get table names required for a specific schema version.
 * Used by migration.ts to verify all tables exist.
 */
export function getRequiredTablesForVersion(version: number): string[] {
  return TABLE_REGISTRY
    .filter(t => t.addedInVersion <= version)
    .map(t => t.name);
}

/**
 * Get table names that should be tracked for delta sync.
 * Excludes internal tables like _pendingChanges, _syncMeta, deviceSecrets.
 */
export function getSyncedTables(): string[] {
  return TABLE_REGISTRY
    .filter(t => t.sync)
    .map(t => t.name);
}

/**
 * Get table names that should be backed up during corruption recovery.
 */
export function getBackupTables(): string[] {
  return TABLE_REGISTRY
    .filter(t => t.backup)
    .map(t => t.name);
}

/**
 * Get the Dexie stores definition for a specific version.
 * Returns an object mapping table names to their index definitions.
 */
export function getStoresForVersion(version: number): Record<string, string> {
  const stores: Record<string, string> = {};
  for (const table of TABLE_REGISTRY) {
    if (table.addedInVersion <= version) {
      stores[table.name] = table.indexes;
    }
  }
  return stores;
}

/**
 * Get all registered table names (for current schema).
 */
export function getAllTableNames(): string[] {
  return TABLE_REGISTRY.map(t => t.name);
}
