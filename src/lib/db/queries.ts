import { db, type Chat, type Message, type Project, type ProjectFile, type ModelFavorite, type ApiKey, type UserSettings, type Agent, type Prompt, type ModelAlias } from "./schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";

// ============= DEFAULT PROJECT =============

export const DEFAULT_PROJECT_ID = "personal";
export const DEFAULT_PROJECT_NAME = "Personal";

/**
 * Ensures the default "Personal" project exists.
 * This project cannot be deleted and is where chats go by default.
 */
export async function ensureDefaultProject(): Promise<Project> {
  const existing = await db.projects.get(DEFAULT_PROJECT_ID);
  if (existing) return existing;

  const now = Date.now();
  const defaultProject: Project = {
    id: DEFAULT_PROJECT_ID,
    name: DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    color: "#6b7280", // gray
  };
  await db.projects.add(defaultProject);
  return defaultProject;
}

/**
 * Get chat count for a project
 */
export async function getProjectChatCount(projectId: string): Promise<number> {
  return await db.chats.where("projectId").equals(projectId).count();
}

/**
 * Move all chats from one project to another
 */
export async function moveChatsToProject(fromProjectId: string, toProjectId: string): Promise<number> {
  const chats = await db.chats.where("projectId").equals(fromProjectId).toArray();
  for (const chat of chats) {
    await db.chats.update(chat.id, { projectId: toProjectId, updatedAt: Date.now() });
  }
  return chats.length;
}

// ============= CHAT QUERIES =============

export async function getAllChats() {
  const chats = await db.chats.toArray();
  // Sort by: pinned first, then by order (if set), then by updatedAt
  return chats.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function getChatById(id: string) {
  return await db.chats.get(id);
}

export async function getChatsByProject(projectId: string) {
  return await db.chats
    .where("projectId")
    .equals(projectId)
    .sortBy("updatedAt")
    .then((chats) => chats.reverse());
}

export async function getPinnedChats() {
  return await db.chats
    .where("pinned")
    .equals(1)
    .sortBy("updatedAt")
    .then((chats) => chats.reverse());
}

export async function getFavoriteChats() {
  return await db.chats
    .where("favorite")
    .equals(1)
    .sortBy("updatedAt")
    .then((chats) => chats.reverse());
}

export async function createChat(chat: Omit<Chat, "id" | "createdAt" | "updatedAt">) {
  // Ensure the default project exists
  await ensureDefaultProject();

  const now = Date.now();
  const newChat: Chat = {
    ...chat,
    // Default to Personal project if no projectId provided
    projectId: chat.projectId || DEFAULT_PROJECT_ID,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await db.chats.add(newChat);
  return newChat;
}

export async function updateChat(id: string, updates: Partial<Chat>) {
  await db.chats.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteChat(id: string) {
  // Delete all messages in this chat
  await db.messages.where("chatId").equals(id).delete();
  // Delete the chat
  await db.chats.delete(id);
}

export async function deleteAllChats() {
  // Delete all messages
  await db.messages.clear();
  // Delete all chats
  await db.chats.clear();
}

export async function searchChats(query: string) {
  // This is a simple search - will be enhanced with Fuse.js
  const lowerQuery = query.toLowerCase();
  return await db.chats
    .filter((chat) => chat.title.toLowerCase().includes(lowerQuery))
    .toArray();
}

// ============= MESSAGE QUERIES =============

export async function getMessages(chatId: string) {
  return await db.messages.where("chatId").equals(chatId).sortBy("createdAt");
}

export async function getMessageById(id: string) {
  return await db.messages.get(id);
}

export async function getLastMessage(chatId: string) {
  const messages = await db.messages.where("chatId").equals(chatId).sortBy("createdAt");
  return messages[messages.length - 1];
}

/**
 * Batch fetch last messages for multiple chats efficiently.
 * Avoids N+1 query problem when displaying chat list.
 */
export async function getLastMessagesForChats(chatIds: string[]): Promise<Map<string, Message | undefined>> {
  if (chatIds.length === 0) return new Map();

  // Get all messages for these chats in one query
  const allMessages = await db.messages
    .where("chatId")
    .anyOf(chatIds)
    .toArray();

  // Group by chatId and find the last one for each
  const byChat = new Map<string, Message[]>();
  for (const msg of allMessages) {
    const arr = byChat.get(msg.chatId) || [];
    arr.push(msg);
    byChat.set(msg.chatId, arr);
  }

  const result = new Map<string, Message | undefined>();
  for (const chatId of chatIds) {
    const messages = byChat.get(chatId) || [];
    if (messages.length > 0) {
      messages.sort((a, b) => a.createdAt - b.createdAt);
      result.set(chatId, messages[messages.length - 1]);
    } else {
      result.set(chatId, undefined);
    }
  }

  return result;
}

export async function getMessagesForBranch(chatId: string, leafMessageId?: string) {
  const messages = await getMessages(chatId);
  if (messages.length === 0) return [];

  const byId = new Map(messages.map((m) => [m.id, m] as const));
  let cursor = leafMessageId ? byId.get(leafMessageId) : messages[messages.length - 1];
  if (!cursor) cursor = messages[messages.length - 1];

  const path: typeof messages = [];
  const visited = new Set<string>();

  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return path.reverse();
}

export async function getMessageSiblings(chatId: string, messageId: string) {
  const messages = await getMessages(chatId);
  const target = messages.find((m) => m.id === messageId);
  if (!target) return [];
  return messages
    .filter((m) => (m.parentId || "") === (target.parentId || ""))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function chatHasBranches(chatId: string) {
  const messages = await getMessages(chatId);
  const counts = new Map<string, number>();
  for (const m of messages) {
    const key = m.parentId || "";
    counts.set(key, (counts.get(key) || 0) + 1);
    if ((counts.get(key) || 0) > 1) return true;
  }
  return false;
}

export async function addMessage(message: Omit<Message, "id" | "createdAt">) {
  const newMessage: Message = {
    ...message,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await db.messages.add(newMessage);
  return newMessage;
}

export async function updateMessage(id: string, updates: Partial<Message>) {
  await db.messages.update(id, updates);
}

export async function deleteMessage(id: string) {
  await db.messages.delete(id);
}

export async function updateMessageRating(id: string, rating: "up" | "down" | null) {
  await db.messages.update(id, { rating: rating ?? undefined });
}

export async function deleteMessagesAfter(chatId: string, timestamp: number) {
  return await db.messages
    .where("chatId")
    .equals(chatId)
    .filter((msg) => msg.createdAt > timestamp)
    .delete();
}

// ============= PROJECT QUERIES =============

export async function getAllProjects() {
  return await db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function getProjectById(id: string) {
  return await db.projects.get(id);
}

export async function createProject(project: Omit<Project, "id" | "createdAt" | "updatedAt">) {
  const now = Date.now();
  const newProject: Project = {
    ...project,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(newProject);
  return newProject;
}

export async function updateProject(id: string, updates: Partial<Project>) {
  await db.projects.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteProject(id: string, cascadeDeleteChats: boolean = true): Promise<{ deletedChats: number }> {
  // Prevent deleting the default project
  if (id === DEFAULT_PROJECT_ID) {
    throw new Error("Cannot delete the default Personal project");
  }

  // Delete all files in this project
  await db.projectFiles.where("projectId").equals(id).delete();

  // Get chats in this project
  const chats = await db.chats.where("projectId").equals(id).toArray();
  let deletedChats = 0;

  if (cascadeDeleteChats) {
    // Delete all chats and their messages
    for (const chat of chats) {
      await db.messages.where("chatId").equals(chat.id).delete();
      await db.chats.delete(chat.id);
      deletedChats++;
    }
  } else {
    // Move chats to the default project
    for (const chat of chats) {
      await db.chats.update(chat.id, { projectId: DEFAULT_PROJECT_ID });
    }
  }

  // Delete the project
  await db.projects.delete(id);

  return { deletedChats };
}

// ============= PROJECT FILE QUERIES =============

export async function getProjectFiles(projectId: string) {
  return await db.projectFiles
    .where("projectId")
    .equals(projectId)
    .sortBy("createdAt")
    .then((files) => files.reverse());
}

export async function getProjectFileById(id: string) {
  return await db.projectFiles.get(id);
}

export async function addProjectFile(file: Omit<ProjectFile, "id" | "createdAt">) {
  const newFile: ProjectFile = {
    ...file,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await db.projectFiles.add(newFile);
  return newFile;
}

export async function deleteProjectFile(id: string) {
  await db.projectFiles.delete(id);
}

// ============= MODEL FAVORITES QUERIES =============

export async function getFavoriteModels() {
  return await db.modelFavorites.orderBy("lastUsed").reverse().toArray();
}

export async function getRecentModels(limit: number = 5) {
  return await db.modelFavorites
    .orderBy("lastUsed")
    .reverse()
    .limit(limit)
    .toArray();
}

export async function toggleModelFavorite(modelId: string, category: string) {
  const existing = await db.modelFavorites.get(modelId);
  if (existing) {
    await db.modelFavorites.delete(modelId);
    return false;
  } else {
    await db.modelFavorites.add({
      id: modelId,
      category,
      lastUsed: Date.now(),
    });
    return true;
  }
}

export async function updateModelLastUsed(modelId: string) {
  const existing = await db.modelFavorites.get(modelId);
  if (existing) {
    await db.modelFavorites.update(modelId, { lastUsed: Date.now() });
  }
}

// ============= API KEY QUERIES =============

export async function getAllApiKeys() {
  return await db.apiKeys.toArray();
}

export async function getApiKeyByProvider(provider: string) {
  return await db.apiKeys.where("provider").equals(provider).first();
}

export async function addApiKey(apiKey: Omit<ApiKey, "id" | "createdAt">) {
  const newKey: ApiKey = {
    ...apiKey,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await db.apiKeys.add(newKey);
  return newKey;
}

export async function updateApiKey(id: string, updates: Partial<ApiKey>) {
  await db.apiKeys.update(id, updates);
}

export async function deleteApiKey(id: string) {
  await db.apiKeys.delete(id);
}

// ============= SETTINGS QUERIES =============

export async function getSettings() {
  let settings = await db.settings.get("default");
  if (!settings) {
    // Create default settings
    settings = {
      id: "default",
      theme: "system",
      enabledTools: [],
      shortcuts: {},
      currentProjectId: undefined,
      updatedAt: Date.now(),
    };
    await db.settings.add(settings);
  }
  return settings;
}

export async function updateSettings(updates: Partial<Omit<UserSettings, "id">>) {
  await db.settings.update("default", { ...updates, updatedAt: Date.now() });
}

export async function markOnboardingCompleted() {
  await updateSettings({
    onboardingCompleted: true,
    onboardingCompletedAt: Date.now(),
  });
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const settings = await getSettings();
  return settings.onboardingCompleted === true;
}

// ============= AGENT QUERIES =============

export async function getAllAgents() {
  return await db.agents.orderBy("updatedAt").reverse().toArray();
}

export async function getAgentById(id: string) {
  return await db.agents.get(id);
}

export async function getActiveAgents() {
  return await db.agents.where("isActive").equals(1).toArray();
}

export async function getBuiltInAgents() {
  return await db.agents.where("isBuiltIn").equals(1).toArray();
}

export async function addAgent(agent: Omit<Agent, "id" | "createdAt" | "updatedAt" | "usageCount">) {
  const now = Date.now();
  const newAgent: Agent = {
    ...agent,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };
  await db.agents.add(newAgent);
  return newAgent;
}

export async function upsertAgent(agent: Agent) {
  await db.agents.put({ ...agent, updatedAt: Date.now() });
}

export async function updateAgent(id: string, updates: Partial<Agent>) {
  await db.agents.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteAgent(id: string) {
  await db.agents.delete(id);
}

export async function incrementAgentUsage(agentId: string) {
  const agent = await db.agents.get(agentId);
  if (!agent) return;
  await db.agents.update(agentId, {
    usageCount: (agent.usageCount || 0) + 1,
    updatedAt: Date.now(),
  });
}

// ============= PROMPT QUERIES =============

export async function getAllPrompts() {
  return await db.prompts.orderBy("updatedAt").reverse().toArray();
}

export async function getPromptById(id: string) {
  return await db.prompts.get(id);
}

export async function searchPrompts(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return await getAllPrompts();
  return await db.prompts
    .filter((p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
    .toArray();
}

export async function searchMessages(query: string) {
  const lowerQuery = query.toLowerCase();

  // Create a fast filter that checks text content
  return await db.messages
    .filter(msg => {
      const content = getTextFromMessageContent(msg.content);
      return content.toLowerCase().includes(lowerQuery);
    })
    .toArray();
}

export async function getPromptsByCategory(category: string) {
  return await db.prompts.where("category").equals(category).toArray();
}

export async function getFavoritePrompts() {
  return await db.prompts.where("isFavorite").equals(1).toArray();
}

export async function addPrompt(prompt: Omit<Prompt, "id" | "createdAt" | "updatedAt" | "usageCount">) {
  const now = Date.now();
  const newPrompt: Prompt = {
    ...prompt,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };
  await db.prompts.add(newPrompt);
  return newPrompt;
}

export async function upsertPrompt(prompt: Prompt) {
  await db.prompts.put({ ...prompt, updatedAt: Date.now() });
}

export async function updatePrompt(id: string, updates: Partial<Prompt>) {
  await db.prompts.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deletePrompt(id: string) {
  await db.prompts.delete(id);
}

export async function incrementPromptUsage(promptId: string) {
  const prompt = await db.prompts.get(promptId);
  if (!prompt) return;
  await db.prompts.update(promptId, {
    usageCount: (prompt.usageCount || 0) + 1,
    updatedAt: Date.now(),
  });
}

// ============= TAG QUERIES =============

export async function getAllTags() {
  return await db.tags.orderBy("name").toArray();
}

export async function getTagById(id: string) {
  return await db.tags.get(id);
}

export async function createTag(tag: Omit<import("./schema").Tag, "id" | "createdAt" | "usageCount">) {
  const newTag: import("./schema").Tag = {
    ...tag,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    usageCount: 0,
  };
  await db.tags.add(newTag);
  return newTag;
}

export async function updateTag(id: string, updates: Partial<import("./schema").Tag>) {
  await db.tags.update(id, updates);
}

export async function deleteTag(id: string) {
  // Remove tag from all chats
  const chats = await db.chats.where("tags").equals(id).toArray();
  for (const chat of chats) {
    await updateChat(chat.id, {
      tags: chat.tags?.filter((t) => t !== id),
    });
  }
  // Delete tag rules
  await db.tagRules.where("tagId").equals(id).delete();
  // Delete tag
  await db.tags.delete(id);
}

export async function incrementTagUsage(tagId: string) {
  const tag = await db.tags.get(tagId);
  if (tag) {
    await db.tags.update(tagId, {
      usageCount: (tag.usageCount || 0) + 1,
    });
  }
}

// ============= TAG RULE QUERIES =============

export async function getAllTagRules() {
  return await db.tagRules.toArray();
}

export async function getTagRules(tagId: string) {
  return await db.tagRules.where("tagId").equals(tagId).toArray();
}

export async function createTagRule(rule: Omit<import("./schema").TagRule, "id" | "createdAt">) {
  const newRule: import("./schema").TagRule = {
    ...rule,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await db.tagRules.add(newRule);
  return newRule;
}

export async function updateTagRule(id: string, updates: Partial<import("./schema").TagRule>) {
  await db.tagRules.update(id, updates);
}

export async function deleteTagRule(id: string) {
  await db.tagRules.delete(id);
}

// ============= PARAMETER PRESET QUERIES =============

export async function getAllPresets() {
  return await db.parameterPresets.orderBy("name").toArray();
}

export async function getPresetById(id: string) {
  return await db.parameterPresets.get(id);
}

export async function createPreset(preset: Omit<import("./schema").ParameterPreset, "id" | "createdAt">) {
  const newPreset: import("./schema").ParameterPreset = {
    ...preset,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await db.parameterPresets.add(newPreset);
  return newPreset;
}

export async function updatePreset(id: string, updates: Partial<import("./schema").ParameterPreset>) {
  await db.parameterPresets.update(id, updates);
}

export async function deletePreset(id: string) {
  await db.parameterPresets.delete(id);
}

export async function getDefaultPresets() {
  return await db.parameterPresets.where("isDefault").equals(1).toArray();
}

// ============= FOLDER QUERIES =============

export async function getAllFolders() {
  const folders = await db.folders.toArray();
  // Sort by order (if set), then by createdAt
  return folders.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return a.createdAt - b.createdAt;
  });
}

export async function createFolder(name: string, color?: string) {
  const newFolder = {
    id: crypto.randomUUID(),
    name,
    color,
    createdAt: Date.now(),
  };
  await db.folders.add(newFolder);
  return newFolder;
}

export async function updateFolder(id: string, updates: Partial<Omit<import("./schema").Folder, "id" | "createdAt">>) {
  await db.folders.update(id, updates);
}

export async function deleteFolder(id: string) {
  // Unlink chats from this folder
  const chats = await db.chats.where("folderId").equals(id).toArray();
  for (const chat of chats) {
    await db.chats.update(chat.id, { folderId: undefined });
  }
  // Delete the folder
  await db.folders.delete(id);
}

export async function reorderChats(chatIds: string[]) {
  // Update order for all chats
  for (let i = 0; i < chatIds.length; i++) {
    await db.chats.update(chatIds[i], { order: i });
  }
}

export async function reorderFolders(folderIds: string[]) {
  // Update order for all folders
  for (let i = 0; i < folderIds.length; i++) {
    await db.folders.update(folderIds[i], { order: i });
  }
}

export async function moveChatToFolder(chatId: string, folderId: string | null) {
  await db.chats.update(chatId, { folderId: folderId || undefined });
}

// ============= WORKFLOW QUERIES =============

export async function getAllWorkflows() {
  return await db.workflows.orderBy("createdAt").reverse().toArray();
}

export async function getWorkflowById(id: string) {
  return await db.workflows.get(id);
}

export async function addWorkflow(workflow: Omit<import("./schema").Workflow, "id" | "createdAt" | "updatedAt">) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const newWorkflow: import("./schema").Workflow = {
    ...workflow,
    id,
    createdAt: now,
    updatedAt: now,
  };
  await db.workflows.add(newWorkflow);
  return newWorkflow;
}

export async function updateWorkflow(id: string, updates: Partial<Omit<import("./schema").Workflow, "id" | "createdAt">>) {
  await db.workflows.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteWorkflow(id: string) {
  await db.workflows.delete(id);
}

// ============= MODEL ALIAS QUERIES =============

export async function getAllModelAliases() {
  return await db.modelAliases.toArray();
}

export async function getModelAlias(modelId: string) {
  return await db.modelAliases.get(modelId);
}

export async function updateModelAlias(modelId: string, alias: string, systemPrompt?: string) {
  const now = Date.now();
  const existing = await db.modelAliases.get(modelId);
  if (existing) {
    await db.modelAliases.update(modelId, { alias, systemPrompt, updatedAt: now });
  } else {
    await db.modelAliases.add({
      id: modelId,
      alias,
      systemPrompt,
      updatedAt: now,
    });
  }
}

export async function deleteModelAlias(modelId: string) {
  await db.modelAliases.delete(modelId);
}
