import Dexie, { type EntityTable } from "dexie";

// Current schema version - update this when adding new migrations
// Used by health check to detect migrations and adjust timeouts
export const DB_SCHEMA_VERSION = 16;

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
  temperature?: number; // Model temperature (0-2, default 1)
  maxTokens?: number; // Max tokens to generate (default varies by model)
  enabledTools?: string[];
  activeMcpServerIds?: string[]; // Active MCP servers for this chat (from agent or user selection)
  budgetCap?: number; // Max spend in USD
  totalCost?: number; // Running total cost in USD
  totalCacheSavings?: number; // Cumulative savings from caching in USD
  activeBranchLeafId?: string; // Currently selected conversation leaf
  hasBranches?: boolean; // Quick indicator for sidebar/UI
  summary?: string; // AI-generated summary of the conversation
  memoryDisabled?: boolean; // Per-chat toggle to disable memory injection
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

export interface PipelineExecutionStep {
  id: string;
  name: string;
  type: "llm" | "image" | "tool" | "subagent";
  input?: string;
  output?: any;
  toolCalls?: Array<{ toolName: string; args: any; result?: any }>;
}

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
  cachedTokens?: number; // Cached tokens from prompt caching (OpenAI, Anthropic, OpenRouter)
  thinkingTokens?: number; // Thinking/reasoning tokens (Anthropic, OpenAI, Google, DeepSeek, xAI)
  cacheSavings?: number; // USD saved from caching
  cost?: number; // Cost in USD for this message
  costIsEstimated?: boolean; // True when tokens/cost were locally estimated (provider usage unavailable)
  isIncomplete?: boolean; // Response was cut off mid-stream
  canContinue?: boolean; // Can continue this response
  rating?: "up" | "down";
  pipelineExecution?: {
    steps: PipelineExecutionStep[];
    agentName?: string;
  };
  skillId?: string; // Skill that was active when this message was generated
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
  displayName?: string; // User's display name (shows initial in avatar)
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
  memoryUserId?: string;             // Mem0 user ID (default: "default-user")
  titleModelId?: string;             // Which model to use for title generation (deprecated, use titleModelIdsByProvider)
  titleModelIdsByProvider?: Record<string, string>; // Per-provider title generation models
  embeddingsProvider?: "openrouter" | "openai"; // Which provider to use for embeddings (default: openrouter)
  embeddingsModelId?: string; // Which embedding model to use (must match what was used for skill embeddings)
  skillMatchThreshold?: number; // Minimum floor for skill auto-detection (0-1, default: 0.25)
  onboardingCompleted?: boolean; // Whether user has completed onboarding
  onboardingCompletedAt?: number; // Timestamp when onboarding was completed
  // Auto-tagging settings
  autoTaggingEnabled?: boolean;      // Whether to auto-generate tags for new chats (default: false)
  // Default MCP server settings
  defaultMcpServerIds?: string[];    // Default MCP servers to enable for new chats
  lastProviderIdByModel?: Record<string, string>;  // modelId -> providerId (remembered provider per model)
  // Default generation settings
  defaultTemperature?: number;       // Default temperature for new chats (0-2, default: 1)
  defaultMaxTokens?: number;         // Default max tokens for new chats (default: 4096)
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
  projectId?: string;
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

// Pipeline step for multi-step agent execution
export interface PipelineStep {
  id: string;
  name: string; // Display name (e.g., "Crafting prompt", "Generating image")
  type: "llm" | "image" | "tool" | "subagent";

  // For LLM steps - generate text using a model
  modelId?: string; // Model to use for this step
  systemPrompt?: string; // System prompt for this step
  providerId?: string; // Provider to use for this step (openrouter, anthropic, etc.)
  enabledTools?: string[]; // Tool names available to this LLM step
  mcpServerIds?: string[]; // MCP servers available to this LLM step
  toolkitOverrides?: Record<string, boolean>; // Per-step Composio toolkit enable/disable overrides (key -> enabled)
  memoryEnabled?: boolean; // Whether to include memory context for this step (default: true for first step)
  includeHistory?: boolean; // Whether to include chat history context (default: false)

  // For image steps - generate image
  imageModelId?: string; // Image generation model
  imageProviderId?: string; // Provider for image generation
  imageSize?: "256x256" | "512x512" | "1024x1024" | "1024x1792" | "1792x1024" | "auto"; // Image dimensions
  imageQuality?: "standard" | "hd"; // Image quality
  imageStyle?: "natural" | "vivid"; // DALL-E 3 style option

  // For subagent steps - invoke another agent
  agentId?: string; // Agent to invoke

  // For tool steps - call an MCP tool
  toolName?: string;
  toolArgs?: Record<string, string>; // Can use {{variables}}

  // Input/output mapping
  inputTemplate: string; // Template with {{variable}} placeholders (e.g., "{{userInput}}", "{{step_1_output}}")
  outputVariable: string; // Where to store result (e.g., "optimizedPrompt")

  // Error handling
  onError?: "continue" | "abort" | "retry";
  maxRetries?: number;
}

// Pipeline configuration for multi-step agents
export interface PipelineConfig {
  steps: PipelineStep[];
  outputTemplate?: string; // How to format final response (e.g., "{{finalImage}}")
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

  // Multi-step execution support
  executionType?: "simple" | "pipeline" | "orchestrator"; // Defaults to "simple"
  pipeline?: PipelineConfig; // For pipeline agents
  subAgentIds?: string[]; // For orchestrator agents - which agents can be invoked
  orchestrationPrompt?: string; // For orchestrator agents - how to decide which sub-agents to call
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

// Skill system - replaces prompt library with semantic matching
export interface SkillTrigger {
  type: "manual" | "auto"; // Auto = embedding-based detection
}

export interface SkillUI {
  icon: string;       // Lucide icon name
  color: string;      // Tailwind color (blue, green, purple, etc.)
  activeLabel: string; // "Creating chart...", "Summarizing..."
}

export interface Skill {
  id: string;
  name: string;
  description: string;           // Used for embedding-based matching (be descriptive!)
  category: "creation" | "visualization" | "coding" | "analysis" | "writing" | "search";

  // Core behavior (progressive disclosure: only loaded when skill activates)
  systemPrompt: string;           // Full instructions injected into context
  userTemplate?: string;          // Optional template with {{variables}}
  variables?: PromptVariable[];   // Reuse existing variable system

  // Trigger config
  trigger: SkillTrigger;

  // Approval flow - show draft and ask before executing tools
  requireApproval?: boolean;      // If true, show draft and confirm before tool use

  // Auto-apply configuration (for requireApproval skills)
  autoApplyQueries?: string[];      // Sample queries for auto-apply matching (positive examples)
  autoApplyEmbeddings?: number[][]; // Individual embeddings for each query (for precise matching)
  autoApplyThreshold?: number;      // Per-skill threshold override (optional)

  // Exclusion queries - "hard negatives" that should NOT match this skill
  exclusionQueries?: string[];      // Queries that are similar but should NOT trigger this skill
  exclusionEmbeddings?: number[][]; // Individual embeddings for each exclusion query

  // UI display
  ui: SkillUI;

  // Metadata
  isBuiltIn: boolean;
  isEnabled: boolean;
  isFavorite?: boolean;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SkillEmbedding {
  skillId: string;           // Foreign key to skills table
  embedding: number[];       // Float32 array
  modelId: string;           // Which embedding model was used
  descriptionHash: string;   // Hash of description (detect changes)
  createdAt: number;
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
  type: "sse" | "stdio" | "http";
  collection: "curated" | "custom";
  headers?: Record<string, string>; // HTTP headers for authentication
  logoUrl?: string;
  author?: string;
  kind?: "hub" | "connector" | "tool"; // Integration kind

  // Stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  category?: string; // For marketplace filtering: search, code, data, security

  // Composio consolidated server fields
  composioToolkits?: Array<{
    key: string;
    name: string;
    logo?: string;
    isEnabled: boolean;
  }>;

  // Advanced: Disable router-first mode for power users
  // When true, exposes ALL tools from Composio instead of just SEARCH+EXECUTE
  // WARNING: Large tool lists degrade model accuracy (BFCL, MCP-Bench research)
  disableRouterFirst?: boolean;
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
  skills!: EntityTable<Skill, "id">;
  skillEmbeddings!: EntityTable<SkillEmbedding, "skillId">;
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

    // Version 14: Add Skills system (replaces Prompts with semantic matching)
    this.version(14).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, summary, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId, rating, skillId",
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
      skills: "id, name, category, isBuiltIn, isEnabled, isFavorite, usageCount, updatedAt",
      skillEmbeddings: "skillId, modelId",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
      modelAliases: "id, alias, updatedAt",
      mcpServers: "id, enabled, createdAt",
    });

    // Version 15: Add projectId to folders
    this.version(15).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, summary, modelId, createdAt, updatedAt, pinned, favorite, folderId, order",
      messages: "id, chatId, role, createdAt, parentId, rating, skillId",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, projectId, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      skills: "id, name, category, isBuiltIn, isEnabled, isFavorite, usageCount, updatedAt",
      skillEmbeddings: "skillId, modelId",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
      modelAliases: "id, alias, updatedAt",
      mcpServers: "id, enabled, createdAt",
    });

    // Version 16: Add composite indexes for performance optimization
    // - [chatId+createdAt] on messages: faster message retrieval for a chat
    // - [projectId+updatedAt] on chats: faster project-scoped chat queries
    this.version(16).stores({
      projects: "id, name, createdAt, updatedAt",
      projectFiles: "id, projectId, name, createdAt",
      chats:
        "id, projectId, title, summary, modelId, createdAt, updatedAt, pinned, favorite, folderId, order, [projectId+updatedAt]",
      messages: "id, chatId, role, createdAt, parentId, rating, skillId, [chatId+createdAt]",
      apiKeys: "id, provider, createdAt, baseUrl",
      settings: "id",
      modelFavorites: "id, category, pinnedOrder, lastUsed",
      userMemories: "id, category, source, createdAt, isActive",
      folders: "id, projectId, name, createdAt, order",
      tags: "id, name, createdAt, usageCount",
      tagRules: "id, tagId, enabled, createdAt",
      parameterPresets: "id, name, createdAt, isDefault",
      agents: "id, name, isBuiltIn, isActive, usageCount, updatedAt",
      prompts: "id, title, category, isBuiltIn, isFavorite, usageCount, updatedAt",
      skills: "id, name, category, isBuiltIn, isEnabled, isFavorite, usageCount, updatedAt",
      skillEmbeddings: "skillId, modelId",
      vectorDocuments: "id, metadata.type, metadata.chatId, metadata.projectId, metadata.memoryId",
      workflows: "id, name, createdAt, updatedAt",
      modelAliases: "id, alias, updatedAt",
      mcpServers: "id, enabled, createdAt",
    });
  }
}

export const db = new LuminaDB();
