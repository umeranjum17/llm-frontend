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
}

export interface Message {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
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
  }
}

export const db = new LuminaDB();
