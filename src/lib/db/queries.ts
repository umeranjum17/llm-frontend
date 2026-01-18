import { db, type Chat, type Message, type Project, type ProjectFile, type ModelFavorite, type ApiKey, type UserSettings, type Agent, type Prompt, type Skill, type ModelAlias, type McpServer, type Folder, type Tag } from "./schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";

// Re-export db for direct access when needed (e.g., batch operations)
export { db };

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

// Simple in-memory cache for getAllChats to avoid repeated full table scans
let chatsCache: { data: Chat[], timestamp: number } | null = null;
const CHATS_CACHE_MAX_AGE = 5000; // 5 seconds

/**
 * Invalidate the chats cache. Call this after any chat mutation.
 */
export function invalidateChatsCache() {
  chatsCache = null;
}

/**
 * Sort chats by: pinned first, then by explicit order if set, otherwise by recency
 */
function sortChats(chats: Chat[]): Chat[] {
  return chats.sort((a, b) => {
    // Pinned chats always come first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    const aHasOrder = a.order !== undefined;
    const bHasOrder = b.order !== undefined;

    // Within the same folder, respect order
    if (a.folderId === b.folderId) {
      // If both have explicit order, sort by order
      if (aHasOrder && bHasOrder) {
        if (a.order !== b.order) return (a.order ?? 0) - (b.order ?? 0);
        // Fallback to recency for same order
        return b.updatedAt - a.updatedAt;
      }
      // If only one has order, that one comes first (manually sorted items stay in place)
      if (aHasOrder && !bHasOrder) return -1;
      if (!aHasOrder && bHasOrder) return 1;
    }

    // Default to newest first for items without explicit order
    return b.updatedAt - a.updatedAt;
  });
}

export async function getAllChats() {
  const chats = await db.chats.toArray();
  return sortChats(chats);
}

/**
 * Get all chats with caching to reduce repeated IndexedDB queries.
 * Use for read-heavy operations like the chat list sidebar.
 * @param maxAge Maximum age of cache in ms (default 5000ms)
 */
export async function getAllChatsCached(maxAge = CHATS_CACHE_MAX_AGE): Promise<Chat[]> {
  // Return cached data if still valid
  if (chatsCache && Date.now() - chatsCache.timestamp < maxAge) {
    return chatsCache.data;
  }

  // Fetch and sort chats using indexed query for better performance
  const chats = await db.chats.orderBy('updatedAt').reverse().toArray();
  const sorted = sortChats(chats);

  // Update cache
  chatsCache = { data: sorted, timestamp: Date.now() };
  return sorted;
}

export async function getChatById(id: string) {
  return await db.chats.get(id);
}

/**
 * Get chat with its messages in a single transaction.
 * More efficient than separate queries when both are needed.
 */
export async function getChatWithMessages(chatId: string): Promise<{ chat: Chat | undefined; messages: Message[] }> {
  return await db.transaction('r', [db.chats, db.messages], async () => {
    const [chat, messages] = await Promise.all([
      db.chats.get(chatId),
      db.messages.where("chatId").equals(chatId).sortBy("createdAt")
    ]);
    return { chat, messages };
  });
}

/**
 * Get chat with its associated agent in a single transaction.
 * Useful for chat-shell where both are needed together.
 */
export async function getChatWithAgent(chatId: string): Promise<{ chat: Chat | undefined; agent: Agent | undefined }> {
  return await db.transaction('r', [db.chats, db.agents], async () => {
    const chat = await db.chats.get(chatId);
    const agent = chat?.agentId ? await db.agents.get(chat.agentId) : undefined;
    return { chat, agent };
  });
}

/**
 * Get the most recent chat without loading all chats.
 * Much faster than getAllChats()[0] for large chat histories.
 */
export async function getMostRecentChat(): Promise<Chat | undefined> {
  return await db.chats.orderBy('updatedAt').reverse().first();
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
  invalidateChatsCache();
  return newChat;
}

export async function updateChat(id: string, updates: Partial<Chat>) {
  await db.chats.update(id, { ...updates, updatedAt: Date.now() });
  invalidateChatsCache();
}

export async function deleteChat(id: string) {
  // Delete all messages in this chat
  await db.messages.where("chatId").equals(id).delete();
  // Delete the chat
  await db.chats.delete(id);
  invalidateChatsCache();
}

export async function deleteAllChats() {
  // Delete all messages
  await db.messages.clear();
  // Delete all chats
  await db.chats.clear();
  invalidateChatsCache();
}

export async function searchChats(query: string) {
  // This is a simple search - will be enhanced with Fuse.js
  const lowerQuery = query.toLowerCase();
  return await db.chats
    .filter((chat) => chat.title.toLowerCase().includes(lowerQuery))
    .toArray();
}

export interface MessageSearchResult extends Message {
  chatTitle?: string;
}

export async function searchMessages(query: string): Promise<MessageSearchResult[]> {
  const lowerQuery = query.toLowerCase();
  const messages: Message[] = [];

  // Use cursor to avoid loading all messages into memory
  // Scan in reverse chronological order and stop once we have 20 matches
  await db.messages
    .orderBy('createdAt')
    .reverse()
    .until(() => messages.length >= 20)
    .each(msg => {
      // Only search text content of user/assistant messages
      if (msg.role !== 'user' && msg.role !== 'assistant') return;

      const content = getTextFromMessageContent(msg.content);
      if (content.toLowerCase().includes(lowerQuery)) {
        messages.push(msg);
      }
    });

  // Batch fetch chat titles for context
  const chatIds = [...new Set(messages.map(m => m.chatId))];
  const chats = await db.chats.where('id').anyOf(chatIds).toArray();
  const chatMap = new Map(chats.map(c => [c.id, c]));

  return messages.map(msg => ({
    ...msg,
    chatTitle: chatMap.get(msg.chatId)?.title
  }));
}

// ============= MESSAGE QUERIES =============

export async function getMessages(chatId: string) {
  return await db.messages.where("chatId").equals(chatId).sortBy("createdAt");
}

/**
 * Get recent messages for a chat with pagination.
 * Loads only the most recent messages initially for faster load times.
 * @param chatId The chat ID
 * @param limit Number of messages to load (default 50)
 * @param beforeTimestamp Load messages before this timestamp (for pagination)
 */
export async function getRecentMessages(
  chatId: string,
  limit: number = 50,
  beforeTimestamp?: number
): Promise<{ messages: Message[]; hasMore: boolean }> {
  let query = db.messages.where("chatId").equals(chatId);

  if (beforeTimestamp) {
    query = query.filter((m) => m.createdAt < beforeTimestamp);
  }

  // Get limit + 1 to check if there are more
  const messages = await query.reverse().limit(limit + 1).toArray();

  const hasMore = messages.length > limit;
  if (hasMore) {
    messages.pop(); // Remove the extra one
  }

  // Return in chronological order
  return { messages: messages.reverse(), hasMore };
}

/**
 * Get the count of messages in a chat without loading them.
 */
export async function getMessageCount(chatId: string): Promise<number> {
  return await db.messages.where("chatId").equals(chatId).count();
}

export async function getMessageById(id: string) {
  return await db.messages.get(id);
}

export async function getLastMessage(chatId: string) {
  // Use reverse().first() to get last message efficiently without loading all messages
  return await db.messages
    .where("chatId")
    .equals(chatId)
    .reverse()
    .first();
}

/**
 * Batch fetch last messages for multiple chats efficiently.
 * Uses parallel queries with limit(1) - much faster than loading all messages.
 */
export async function getLastMessagesForChats(chatIds: string[]): Promise<Map<string, Message | undefined>> {
  if (chatIds.length === 0) return new Map();

  const result = new Map<string, Message | undefined>();

  // Use parallel queries with limit(1) for each chat
  // This is much faster than loading all messages and sorting
  await Promise.all(chatIds.map(async (chatId) => {
    const msg = await db.messages
      .where('chatId')
      .equals(chatId)
      .reverse()
      .first();
    result.set(chatId, msg);
  }));

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

  // Update the chat's updatedAt to reflect new activity
  await db.chats.update(message.chatId, { updatedAt: Date.now() });
  invalidateChatsCache();

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
  const chatIds = chats.map((c) => c.id);
  let deletedChats = 0;

  if (cascadeDeleteChats && chatIds.length > 0) {
    // Batch delete all messages for these chats, then delete the chats
    await db.messages.where("chatId").anyOf(chatIds).delete();
    await db.chats.bulkDelete(chatIds);
    deletedChats = chatIds.length;
  } else if (!cascadeDeleteChats && chatIds.length > 0) {
    // Batch move chats to the default project
    await db.transaction("rw", db.chats, async () => {
      for (const chatId of chatIds) {
        await db.chats.update(chatId, { projectId: DEFAULT_PROJECT_ID });
      }
    });
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

/**
 * Batch fetch multiple project files by ID.
 * More efficient than multiple getProjectFileById calls.
 */
export async function getProjectFilesByIds(ids: string[]): Promise<Map<string, ProjectFile>> {
  if (ids.length === 0) return new Map();
  const files = await db.projectFiles.where('id').anyOf(ids).toArray();
  return new Map(files.map(f => [f.id, f]));
}

/**
 * Batch fetch multiple chats with their messages.
 * More efficient than separate queries for each chat.
 */
export async function getChatsWithMessagesByIds(
  chatIds: string[]
): Promise<Map<string, { chat: Chat; messages: Message[] }>> {
  if (chatIds.length === 0) return new Map();

  return await db.transaction('r', [db.chats, db.messages], async () => {
    const [chats, allMessages] = await Promise.all([
      db.chats.where('id').anyOf(chatIds).toArray(),
      db.messages.where('chatId').anyOf(chatIds).toArray()
    ]);

    const chatMap = new Map(chats.map(c => [c.id, c]));
    const messagesByChat = new Map<string, Message[]>();

    // Group messages by chatId
    for (const msg of allMessages) {
      const arr = messagesByChat.get(msg.chatId) || [];
      arr.push(msg);
      messagesByChat.set(msg.chatId, arr);
    }

    // Sort messages by createdAt within each chat
    for (const [, msgs] of messagesByChat) {
      msgs.sort((a, b) => a.createdAt - b.createdAt);
    }

    const result = new Map<string, { chat: Chat; messages: Message[] }>();
    for (const chatId of chatIds) {
      const chat = chatMap.get(chatId);
      if (chat) {
        result.set(chatId, {
          chat,
          messages: messagesByChat.get(chatId) || []
        });
      }
    }

    return result;
  });
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

/**
 * Batch query for model picker data - reduces 3 queries to 1 transaction
 */
export async function getModelPickerData() {
  return await db.transaction("r", [db.modelFavorites, db.modelAliases], async () => {
    const [favorites, recent, aliases] = await Promise.all([
      db.modelFavorites.orderBy("lastUsed").reverse().toArray(),
      db.modelFavorites.orderBy("lastUsed").reverse().limit(6).toArray(),
      db.modelAliases.toArray(),
    ]);
    return { favorites, recent, aliases };
  });
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

/**
 * Batch fetch multiple agents by ID.
 * More efficient than multiple getAgentById calls.
 */
export async function getAgentsByIds(ids: string[]): Promise<Map<string, Agent>> {
  if (ids.length === 0) return new Map();
  const agents = await db.agents.where('id').anyOf(ids).toArray();
  return new Map(agents.map(a => [a.id, a]));
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

export async function resetAgentToDefault(agentId: string): Promise<string | undefined> {
  // Dynamic import to avoid circular dependency
  const { BUILTIN_AGENTS } = await import("@/lib/constants/agents");

  const builtInAgent = BUILTIN_AGENTS.find((a) => a.id === agentId);
  if (!builtInAgent) {
    throw new Error("Agent is not a built-in agent");
  }

  const existingAgent = await db.agents.get(agentId);
  if (!existingAgent) {
    throw new Error("Agent not found");
  }

  // Reset to built-in defaults while preserving usage count and timestamps
  await db.agents.update(agentId, {
    name: builtInAgent.name,
    description: builtInAgent.description,
    avatar: builtInAgent.avatar,
    systemPrompt: builtInAgent.systemPrompt,
    modelId: builtInAgent.modelId,
    enabledTools: builtInAgent.enabledTools,
    mcpServerIds: builtInAgent.mcpServerIds,
    mcpToolPolicy: undefined,
    knowledgeBaseIds: builtInAgent.knowledgeBaseIds,
    parameters: builtInAgent.parameters,
    isActive: builtInAgent.isActive,
    executionType: builtInAgent.executionType,
    pipeline: builtInAgent.pipeline,
    updatedAt: Date.now(),
  });

  return builtInAgent.modelId;
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

// ============= SKILL QUERIES =============

export async function getAllSkills() {
  return await db.skills.orderBy("updatedAt").reverse().toArray();
}

export async function getSkillById(id: string) {
  return await db.skills.get(id);
}

export async function getEnabledSkills() {
  return await db.skills.filter((s) => s.isEnabled).toArray();
}

export async function getAutoTriggerSkills() {
  return await db.skills.filter((s) => s.isEnabled && s.trigger.type === "auto").toArray();
}

export async function getFavoriteSkills() {
  return await db.skills.filter((s) => s.isFavorite === true).toArray();
}

export async function getSkillsByCategory(category: string) {
  return await db.skills.where("category").equals(category).toArray();
}

export async function addSkill(skill: Omit<Skill, "id" | "createdAt" | "updatedAt" | "usageCount">) {
  const now = Date.now();
  const newSkill: Skill = {
    ...skill,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };
  await db.skills.add(newSkill);
  return newSkill;
}

export async function upsertSkill(skill: Skill) {
  await db.skills.put({ ...skill, updatedAt: Date.now() });
}

export async function updateSkill(id: string, updates: Partial<Skill>) {
  await db.skills.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteSkill(id: string) {
  // Also delete the embedding
  await db.skillEmbeddings.delete(id);
  await db.skills.delete(id);
}

export async function incrementSkillUsage(skillId: string) {
  const skill = await db.skills.get(skillId);
  if (!skill) return;
  await db.skills.update(skillId, {
    usageCount: (skill.usageCount || 0) + 1,
    updatedAt: Date.now(),
  });
}

export async function toggleSkillFavorite(skillId: string) {
  const skill = await db.skills.get(skillId);
  if (!skill) return;
  await db.skills.update(skillId, {
    isFavorite: !skill.isFavorite,
    updatedAt: Date.now(),
  });
}

export async function toggleSkillEnabled(skillId: string) {
  const skill = await db.skills.get(skillId);
  if (!skill) return;
  await db.skills.update(skillId, {
    isEnabled: !skill.isEnabled,
    updatedAt: Date.now(),
  });
}

// ============= SKILL AUTO-APPLY QUERIES =============

/**
 * Compute the average of multiple embeddings (composite embedding)
 */
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  if (embeddings.length === 1) return embeddings[0];

  const dimensions = embeddings[0].length;
  const result = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      result[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    result[i] /= embeddings.length;
  }

  return result;
}

/**
 * Set skill's auto-apply queries and generate individual embeddings for each.
 * Each query gets its own embedding for precise matching.
 * Requires an API key and provider info for embedding generation.
 */
export async function setSkillAutoApplyQueries(
  skillId: string,
  queries: string[],
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<void> {
  const { getEmbedding } = await import("@/lib/skills/skill-embeddings");

  if (queries.length === 0) {
    await updateSkill(skillId, {
      autoApplyQueries: [],
      autoApplyEmbeddings: undefined,
    });
    return;
  }

  // Generate individual embedding for each query
  const embeddings: number[][] = [];
  for (const query of queries) {
    const embedding = await getEmbedding(query, apiKey, providerId, modelId);
    if (embedding) {
      embeddings.push(embedding);
    }
  }

  if (embeddings.length === 0) {
    console.warn("[Skills] Failed to generate any embeddings for auto-apply queries");
    await updateSkill(skillId, {
      autoApplyQueries: queries,
      autoApplyEmbeddings: undefined,
    });
    return;
  }

  // Store individual embeddings (not averaged)
  await updateSkill(skillId, {
    autoApplyQueries: queries,
    autoApplyEmbeddings: embeddings,
  });

}

/**
 * Add a single auto-apply query to a skill and recompute composite embedding.
 */
export async function addSkillAutoApplyQuery(
  skillId: string,
  query: string,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<void> {
  const skill = await db.skills.get(skillId);
  if (!skill) return;

  const existingQueries = skill.autoApplyQueries || [];
  if (existingQueries.includes(query)) return; // Already exists

  const newQueries = [...existingQueries, query];
  await setSkillAutoApplyQueries(skillId, newQueries, apiKey, providerId, modelId);
}

/**
 * Remove a single auto-apply query from a skill and recompute composite embedding.
 */
export async function removeSkillAutoApplyQuery(
  skillId: string,
  query: string,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<void> {
  const skill = await db.skills.get(skillId);
  if (!skill) return;

  const existingQueries = skill.autoApplyQueries || [];
  const newQueries = existingQueries.filter((q) => q !== query);

  await setSkillAutoApplyQueries(skillId, newQueries, apiKey, providerId, modelId);
}

// ============= SKILL EXCLUSION QUERIES =============

/**
 * Set skill's exclusion queries and generate individual embeddings for each.
 * Each query gets its own embedding for precise matching.
 * These are "hard negatives" - queries that should NOT match this skill.
 */
export async function setSkillExclusionQueries(
  skillId: string,
  queries: string[],
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<void> {
  const { getEmbedding } = await import("@/lib/skills/skill-embeddings");

  if (queries.length === 0) {
    await updateSkill(skillId, {
      exclusionQueries: [],
      exclusionEmbeddings: undefined,
    });
    return;
  }

  // Generate individual embedding for each exclusion query
  const embeddings: number[][] = [];
  for (const query of queries) {
    const embedding = await getEmbedding(query, apiKey, providerId, modelId);
    if (embedding) {
      embeddings.push(embedding);
    }
  }

  if (embeddings.length === 0) {
    console.warn("[Skills] Failed to generate any embeddings for exclusion queries");
    await updateSkill(skillId, {
      exclusionQueries: queries,
      exclusionEmbeddings: undefined,
    });
    return;
  }

  // Store individual embeddings (not averaged)
  await updateSkill(skillId, {
    exclusionQueries: queries,
    exclusionEmbeddings: embeddings,
  });

}

/**
 * Add a single exclusion query to a skill and recompute composite embedding.
 */
export async function addSkillExclusionQuery(
  skillId: string,
  query: string,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<void> {
  const skill = await db.skills.get(skillId);
  if (!skill) return;

  const existingQueries = skill.exclusionQueries || [];
  if (existingQueries.includes(query)) return; // Already exists

  const newQueries = [...existingQueries, query];
  await setSkillExclusionQueries(skillId, newQueries, apiKey, providerId, modelId);
}

/**
 * Remove a single exclusion query from a skill and recompute composite embedding.
 */
export async function removeSkillExclusionQuery(
  skillId: string,
  query: string,
  apiKey: string,
  providerId: string = "openrouter",
  modelId?: string
): Promise<void> {
  const skill = await db.skills.get(skillId);
  if (!skill) return;

  const existingQueries = skill.exclusionQueries || [];
  const newQueries = existingQueries.filter((q) => q !== query);

  await setSkillExclusionQueries(skillId, newQueries, apiKey, providerId, modelId);
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

export async function createFolder(name: string, color?: string, projectId?: string) {
  const newFolder = {
    id: crypto.randomUUID(),
    name,
    color,
    projectId,
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
  // Batch update order for all chats in a single transaction
  await db.transaction("rw", db.chats, async () => {
    for (let i = 0; i < chatIds.length; i++) {
      await db.chats.update(chatIds[i], { order: i });
    }
  });
}

export async function reorderFolders(folderIds: string[]) {
  // Batch update order for all folders in a single transaction
  await db.transaction("rw", db.folders, async () => {
    for (let i = 0; i < folderIds.length; i++) {
      await db.folders.update(folderIds[i], { order: i });
    }
  });
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
// MCP Servers
export async function getEnabledMcpServers() {
  return await db.mcpServers.filter(server => server.enabled === true).toArray();
}

export async function getMcpServersByIds(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  return await db.mcpServers.where('id').anyOf(ids).toArray();
}

export async function getActiveMcpServersForChat(activeMcpServerIds?: string[]) {
  // If chat has specific active MCP servers, use those
  if (activeMcpServerIds !== undefined) {
    return await getMcpServersByIds(activeMcpServerIds);
  }
  // Default to no MCP servers - user must explicitly enable them per session
  return [];
}

export async function getAllMcpServers() {
  return await db.mcpServers.toArray();
}

export async function getMcpServerById(id: string) {
  return await db.mcpServers.get(id);
}

export async function addMcpServer(server: Omit<McpServer, 'createdAt' | 'updatedAt'>) {
  const now = Date.now();
  await db.mcpServers.add({
    ...server,
    // Initialize with all tools enabled by default (empty disabledTools list)
    toolPolicy: server.toolPolicy ?? { disabledTools: [] },
    createdAt: now,
    updatedAt: now,
  } as McpServer);
}

export async function updateMcpServer(id: string, updates: Partial<McpServer>) {
  await db.mcpServers.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateMcpServerConnectionStatus(
  id: string,
  status: 'connected' | 'disconnected' | 'error',
  error?: string,
  tools?: any[]
) {
  await db.mcpServers.update(id, {
    status,
    error,
    tools,
    lastConnectedAt: status === 'connected' ? Date.now() : undefined,
    updatedAt: Date.now(),
  });
}

export async function updateMcpServerToolPolicy(id: string, disabledTools: string[]) {
  const server = await db.mcpServers.get(id);
  if (!server) return;

  // When tool policy changes, clear the cached tools to force re-fetch
  // This ensures the disabled tools are immediately reflected
  await db.mcpServers.update(id, {
    toolPolicy: { disabledTools },
    tools: undefined, // Clear cache - will be refetched on next connection
    status: 'disconnected', // Mark as disconnected to trigger reconnection
    updatedAt: Date.now(),
  });
}

export async function deleteMcpServer(id: string) {
  await db.mcpServers.delete(id);
}
