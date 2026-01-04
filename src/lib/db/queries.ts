import { db, type Chat, type Message, type Project, type ProjectFile, type ModelFavorite, type ApiKey, type UserSettings } from "./schema";

// ============= CHAT QUERIES =============

export async function getAllChats() {
  return await db.chats.orderBy("updatedAt").reverse().toArray();
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
  const now = Date.now();
  const newChat: Chat = {
    ...chat,
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

export async function deleteProject(id: string) {
  // Delete all files in this project
  await db.projectFiles.where("projectId").equals(id).delete();
  // Unlink chats from this project
  const chats = await db.chats.where("projectId").equals(id).toArray();
  for (const chat of chats) {
    await db.chats.update(chat.id, { projectId: undefined });
  }
  // Delete the project
  await db.projects.delete(id);
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
  return await db.modelFavorites.orderBy("pinnedOrder").toArray();
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
      updatedAt: Date.now(),
    };
    await db.settings.add(settings);
  }
  return settings;
}

export async function updateSettings(updates: Partial<Omit<UserSettings, "id">>) {
  await db.settings.update("default", { ...updates, updatedAt: Date.now() });
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
  return await db.folders.orderBy("createdAt").toArray();
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
