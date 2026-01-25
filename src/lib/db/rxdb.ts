import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import {
  chatSchema,
  messageSchema,
  agentSchema,
  settingsSchema,
  folderSchema,
  tagSchema,
  apiKeysSchema,
  projectSchema,
  projectFileSchema,
  modelFavoriteSchema,
  tagRuleSchema,
  parameterPresetSchema,
  promptSchema,
  skillSchema,
  skillEmbeddingSchema,
  vectorDocumentSchema,
  workflowSchema,
  modelAliasSchema,
  mcpServerSchema,
  deviceSecretSchema,
  cloudSyncConfigSchema,
  contextSummarySchema,
  syncStateSchema
} from './rxdb-schemas';
import { createLastWriteWinsHandler, createSimpleConflictHandler } from '../cloud-sync/rxdb-conflict-handler';

// Multi-tab support
addRxPlugin(RxDBLeaderElectionPlugin);

// Type definitions for collections
export type LuminaCollections = {
  chats: RxCollection;
  messages: RxCollection;
  agents: RxCollection;
  settings: RxCollection;
  folders: RxCollection;
  tags: RxCollection;
  apiKeys: RxCollection;
  projects: RxCollection;
  projectFiles: RxCollection;
  modelFavorites: RxCollection;
  tagRules: RxCollection;
  parameterPresets: RxCollection;
  prompts: RxCollection;
  skills: RxCollection;
  skillEmbeddings: RxCollection;
  vectorDocuments: RxCollection;
  workflows: RxCollection;
  modelAliases: RxCollection;
  mcpServers: RxCollection;
  deviceSecrets: RxCollection;
  cloudSyncConfig: RxCollection;
  contextSummaries: RxCollection;
  syncState: RxCollection;
};

export type LuminaDatabase = RxDatabase<LuminaCollections>;

let dbPromise: Promise<LuminaDatabase> | null = null;

/**
 * Check if the database has been initialized
 */
export function isDatabaseOpen(): boolean {
  return dbPromise !== null;
}

export async function getDatabase(): Promise<LuminaDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = createRxDatabase<LuminaCollections>({
    name: 'luminadb_rxdb',
    storage: getRxStorageDexie(),
    multiInstance: true,    // Multi-tab support
    eventReduce: true,      // Performance optimization
    ignoreDuplicate: true   // Handle cases where DB already exists
  }).then(async (db) => {
    await db.addCollections({
      chats: { schema: chatSchema, conflictHandler: createLastWriteWinsHandler() },
      messages: { schema: messageSchema, conflictHandler: createLastWriteWinsHandler() },
      agents: { schema: agentSchema, conflictHandler: createLastWriteWinsHandler() },
      settings: { schema: settingsSchema, conflictHandler: createLastWriteWinsHandler() },
      folders: { schema: folderSchema, conflictHandler: createSimpleConflictHandler() },
      tags: { schema: tagSchema, conflictHandler: createSimpleConflictHandler() },
      apiKeys: { schema: apiKeysSchema, conflictHandler: createSimpleConflictHandler() },
      projects: { schema: projectSchema, conflictHandler: createLastWriteWinsHandler() },
      projectFiles: { schema: projectFileSchema, conflictHandler: createSimpleConflictHandler() },
      modelFavorites: { schema: modelFavoriteSchema, conflictHandler: createSimpleConflictHandler() },
      tagRules: { schema: tagRuleSchema, conflictHandler: createSimpleConflictHandler() },
      parameterPresets: { schema: parameterPresetSchema, conflictHandler: createSimpleConflictHandler() },
      prompts: { schema: promptSchema, conflictHandler: createLastWriteWinsHandler() },
      skills: { schema: skillSchema, conflictHandler: createLastWriteWinsHandler() },
      skillEmbeddings: { schema: skillEmbeddingSchema, conflictHandler: createSimpleConflictHandler() },
      vectorDocuments: { schema: vectorDocumentSchema, conflictHandler: createSimpleConflictHandler() },
      workflows: { schema: workflowSchema, conflictHandler: createLastWriteWinsHandler() },
      modelAliases: { schema: modelAliasSchema, conflictHandler: createSimpleConflictHandler() },
      mcpServers: { schema: mcpServerSchema, conflictHandler: createLastWriteWinsHandler() },
      deviceSecrets: { schema: deviceSecretSchema, conflictHandler: createSimpleConflictHandler() },
      cloudSyncConfig: { schema: cloudSyncConfigSchema, conflictHandler: createLastWriteWinsHandler() },
      contextSummaries: { schema: contextSummarySchema, conflictHandler: createSimpleConflictHandler() },
      syncState: { schema: syncStateSchema, conflictHandler: createSimpleConflictHandler() }
    });
    return db as LuminaDatabase;
  }).catch((err) => {
    // Reset promise on error to allow retry
    dbPromise = null;
    console.error('[RxDB] Database initialization failed:', err);
    throw new Error(`Failed to initialize database: ${err instanceof Error ? err.message : String(err)}`);
  });

  return dbPromise;
}
