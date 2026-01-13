import Dexie, { type EntityTable } from "dexie";

// Type definitions
export interface Project {
  id: string;
  name: string;
  systemPrompt?: string;
  createdAt: number;
  updatedAt: number;
  color?: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  size: number;
  text?: string; // Extracted text for LLM context
  createdAt: number;
}

export interface Chat {
  id: string;
  projectId?: string;
  title: string;
  modelId: string;
  providerId?: string; // Preferred provider for this chat (optional)
  agentId?: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  favorite?: boolean;
  tags?: string[];
  folderId?: string;
  order?: number; // For manual ordering within folder
  reasoningLevel?: "low" | "medium" | "high" | "xhigh";
  enabledTools?: string[];
  activeMcpServerIds?: string[]; // Active MCP servers for this chat (from agent or user selection)
  budgetCap?: number; // Max spend in USD
  totalCost?: number; // Running total cost in USD
  activeBranchLeafId?: string; // Currently selected conversation leaf
  hasBranches?: boolean; // Quick indicator for sidebar/UI
  summary?: string; // AI-generated summary of the conversation
}

export type MessageContentPart =
  | {
    type: "text";
    text: string;
  }
  | {
    type: "image_url";
    image_url: {
      url: string; // data URL or https URL
      detail?: "auto" | "low" | "high";
    };
  };

export type MessageContent = string | MessageContentPart[];

export interface Message {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent;
  createdAt: number;
  modelId?: string; // Which model generated this (for Arena)
  isArena?: boolean; // Is this a trial/arena message
  parentId?: string; // For future branching
  toolCalls?: any[];
  toolResults?: any[];
  reasoning?: string; // For models with separate reasoning
  inputTokens?: number; // Tokens in the request
  outputTokens?: number; // Tokens in the response
  cost?: number; // Cost in USD for this message
  costIsEstimated?: boolean; // True when tokens/cost were locally estimated (provider usage unavailable)
  isIncomplete?: boolean; // Response was cut off mid-stream
  canContinue?: boolean; // Can continue this response
  rating?: "up" | "down";
}

export interface ApiKey {
  id: string;
  provider: string; // 'openrouter' | 'openai' | 'anthropic' etc.
  key: string; // Should be encrypted in production
  baseUrl?: string; // For OpenAI-compatible providers / local endpoints
  createdAt: number;
  label?: string;
}

export interface UserSettings {
  id: string; // Always 'default'
  theme: "light" | "dark" | "system";
  defaultProviderId?: string;
  defaultModelId?: string;
  defaultModelIdsByProvider?: Record<string, string>;
  defaultReasoningLevel?: string;
  enabledTools: string[];
  shortcuts: Record<string, string>;
  sidebarWidth?: number;
  currentProjectId?: string;
  updatedAt: number;
  // Memory settings
  memoryEnabled?: boolean;           // Master toggle for memory feature
  memoryModelId?: string;            // Which model to use for extraction (deprecated, use memoryModelIdsByProvider)
  memoryModelIdsByProvider?: Record<string, string>; // Per-provider memory extraction models
  memoryRetentionDays?: number;      // null/undefined = forever, or days to keep
  memoryAutoExtract?: boolean;       // Auto-learn from conversations
  memoryCacheTTL?: number;           // Cache TTL in seconds (default: 30)
  memoryMaxItems?: number;           // Limit total memories
  titleModelId?: string;             // Which model to use for title generation (deprecated, use titleModelIdsByProvider)
  titleModelIdsByProvider?: Record<string, string>; // Per-provider title generation models
  embeddingsProvider?: "openrouter" | "openai"; // Which provider to use for embeddings (default: openrouter)
  onboardingCompleted?: boolean; // Whether user has completed onboarding
  onboardingCompletedAt?: number; // Timestamp when onboarding was completed
  // Auto-tagging settings
  autoTaggingEnabled?: boolean;      // Whether to auto-generate tags for new chats (default: false)
}

export interface ModelFavorite {
  id: string; // modelId
  category: string;
  pinnedOrder?: number;
  lastUsed: number;
}

export interface UserMemory {
  id: string;
  content: string;                    // "The user's name is Umer"
  category: "fact" | "preference" | "project" | "skill" | "other";
  confidence: number;                 // 0-1 how confident the AI is about this fact
  source: "auto" | "manual";          // Auto-extracted or user-added
  chatId?: string;                    // Which chat it came from (for auto-extracted)
  createdAt: number;
  updatedAt: number;
  isActive: boolean;                  // User can disable specific memories
}

export interface Folder {
  id: string;
  name: string;
  color?: string;
  order?: number; // For manual ordering
  createdAt: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: number;
  usageCount?: number;
}

export interface TagRule {
  id: string;
  tagId: string;
  pattern: string;
  type: "keyword" | "regex";
  enabled: boolean;
  createdAt: number;
}

export interface ParameterPreset {
  id: string;
  name: string;
  description?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  createdAt: number;
  isDefault?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  avatar?: string; // Emoji or image URL
  systemPrompt: string;
  modelId?: string; // Override default model
  enabledTools: string[];
  mcpServerIds: string[]; // Linked MCP servers for this agent
  mcpToolPolicy?: {
    // Per-tool enable/disable within linked servers
    disabledTools: string[]; // Tool names to disable (denylist)
  };
  knowledgeBaseIds: string[];
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  isBuiltIn: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

export interface PromptVariable {
  name: string;
  placeholder: string;
  defaultValue?: string;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  description?: string;
  variables: PromptVariable[];
  tags: string[];
  category?: string;
  isFavorite: boolean;
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata?: {
    chatId?: string;
    messageId?: string;
    projectId?: string;
    fileId?: string;
    timestamp?: number;
    // Memory specific
    type?: "memory" | "document";
    memoryId?: string;
    category?: string;
  };
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: any[]; // JSON array of steps
  createdAt: number;
  updatedAt: number;
}


export interface ToolPolicy {
  disabledTools: string[]; // List of disabled tool names (denylist approach)
}

export interface McpServer {
  id: string;
  name: string;
  url: string; // SSE endpoint
  apiKey?: string; // Optional API key for authentication
  description?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastConnectedAt?: number;
  status?: "connected" | "disconnected" | "error";
  error?: string;
  tools?: any[]; // Cached tools list

  // Tool governance
  toolPolicy?: ToolPolicy; // Per-tool enable/disable policy
  toolCaps?: number; // Maximum number of tools to inject (safety limit)

  // Marketplace fields
  type: "sse" | "stdio";
  collection: "curated" | "custom";
  logoUrl?: string;
  author?: string;
  kind?: "hub" | "connector" | "tool"; // Integration kind

  // Stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  category?: string; // For marketplace filtering: search, code, data, security
}

export interface ModelAlias {
  id: string; // modelId
  alias: string;
  systemPrompt?: string;
  updatedAt: number;
}

// Database class
export class LuminaDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  projectFiles!: EntityTable<ProjectFile, "id">;
  chats!: EntityTable<Chat, "id">;
  messages!: EntityTable<Message, "id">;
  apiKeys!: EntityTable<ApiKey, "id">;
  settings!: EntityTable<UserSettings, "id">;
  modelFavorites!: EntityTable<ModelFavorite, "id">;
  userMemories!: EntityTable<UserMemory, "id">;
  folders!: EntityTable<Folder, "id">;
  tags!: EntityTable<Tag, "id">;
  tagRules!: EntityTable<TagRule, "id">;
  parameterPresets!: EntityTable<ParameterPreset, "id">;
  agents!: EntityTable<Agent, "id">;
  prompts!: EntityTable<Prompt, "id">;
  vectorDocuments!: EntityTable<VectorDocument, "id">;
  workflows!: EntityTable<Workflow, "id">;
  modelAliases!: EntityTable<ModelAlias, "id">;
  mcpServers!: EntityTable<McpServer, "id">;

  constructor() {
    super("LuminaDB");

    this.version(1).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      folders: "id, name, createdAt",
    });

    // Version 2: Add tags and tag rules
    this.version(2).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      folders: "id, name, createdAt",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
    });

    // Version 3: Add agents and prompt library
    this.version(3).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      folders: "id, name, createdAt",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
    });

    // Version 4: API keys can store base URLs (OpenAI-compatible + local)
    this.version(4).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      folders: "id, name, createdAt",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
    });

    // Version 5: Add vector documents for RAG
    this.version(5).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      folders: "id, name, createdAt",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id",
    });

    // Version 6: Add order fields for drag & drop
    this.version(6).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id",
    });

    // Version 7: Add user memories for ChatGPT-like memory feature
    this.version(7).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id",
    });

    // Version 8: Add indexing for vector documents to improve performance
    this.version(8).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
    });

    // Version 9: Add Workflows
    this.version(9).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
    });

    // Version 10: Add message ratings
    this.version(10).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId, rating",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
    });
    // Version 11: Add summary to chats
    this.version(11).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, summary, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId, rating",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
    });
    // Version 12: Add model aliases
    this.version(12).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, summary, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId, rating",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
      modelAliases: "id, alias, updatedAt",
    });

    // Version 13: Add MCP Servers
    this.version(13).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, summary, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId, rating",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
      modelAliases: "id, alias, updatedAt",
      mcpServers: "id, enabled, createdAt",
    });
  }
}

export const db = new LuminaDB();
