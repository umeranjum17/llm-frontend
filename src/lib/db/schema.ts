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
  reasoningLevel?: "low" | "medium" | "high" | "xhigh";
  enabledTools?: string[];
  budgetCap?: number; // Max spend in USD
  totalCost?: number; // Running total cost in USD
  activeBranchLeafId?: string; // Currently selected conversation leaf
  hasBranches?: boolean; // Quick indicator for sidebar/UI
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
  isIncomplete?: boolean; // Response was cut off mid-stream
  canContinue?: boolean; // Can continue this response
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
  defaultModelId?: string;
  defaultReasoningLevel?: string;
  enabledTools: string[];
  shortcuts: Record<string, string>;
  sidebarWidth?: number;
  currentProjectId?: string;
  updatedAt: number;
}

export interface ModelFavorite {
  id: string; // modelId
  category: string;
  pinnedOrder?: number;
  lastUsed: number;
}

export interface Folder {
  id: string;
  name: string;
  color?: string;
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

// Database class
export class LuminaDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  projectFiles!: EntityTable<ProjectFile, "id">;
  chats!: EntityTable<Chat, "id">;
  messages!: EntityTable<Message, "id">;
  apiKeys!: EntityTable<ApiKey, "id">;
  settings!: EntityTable<UserSettings, "id">;
  modelFavorites!: EntityTable<ModelFavorite, "id">;
  folders!: EntityTable<Folder, "id">;
  tags!: EntityTable<Tag, "id">;
  tagRules!: EntityTable<TagRule, "id">;
  parameterPresets!: EntityTable<ParameterPreset, "id">;
  agents!: EntityTable<Agent, "id">;
  prompts!: EntityTable<Prompt, "id">;

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
  }
}

export const db = new LuminaDB();
