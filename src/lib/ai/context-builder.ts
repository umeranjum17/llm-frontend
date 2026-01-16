import { getProjectFileById, getMessages, getChatById, getAgentById, getModelAlias, getSettings } from "@/lib/db/queries";
import type { Message } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { retrieveContext } from "@/lib/rag/retrieval";
import { searchMemories, type MemoryItem } from "@/lib/memory";

/**
 * Memory injection budget constants.
 *
 * Research shows memory helps, but only when bounded and relevance-scored.
 * These defaults are conservative to avoid context pollution.
 */
export const MEMORY_BUDGET = {
  /** Maximum tokens for memory context (~4 chars per token) */
  MAX_TOKENS: 800,
  /** Maximum characters for memory context */
  MAX_CHARS: 3200, // 800 * 4
  /** Maximum number of memory items to include */
  MAX_ITEMS: 6,
  /** Minimum relevance score (0-1) for inclusion */
  MIN_RELEVANCE: 0.75,
} as const;

/**
 * Filter and budget memories based on relevance and token limits.
 */
function budgetMemories(memories: MemoryItem[]): MemoryItem[] {
  // Filter by relevance score (if available)
  const relevantMemories = memories.filter(m => {
    // If no score available, include it (backend didn't return scores)
    if (m.score === undefined || m.score === null) return true;
    return m.score >= MEMORY_BUDGET.MIN_RELEVANCE;
  });

  // Sort by relevance (highest first)
  const sortedMemories = relevantMemories.sort((a, b) => {
    const aScore = a.score ?? 0.5; // Default to 0.5 if no score
    const bScore = b.score ?? 0.5;
    return bScore - aScore;
  });

  // Apply item limit and character budget
  const budgetedMemories: MemoryItem[] = [];
  let totalChars = 0;

  for (const memory of sortedMemories) {
    // Check item limit
    if (budgetedMemories.length >= MEMORY_BUDGET.MAX_ITEMS) break;

    // Check character budget (include overhead for formatting)
    const memoryChars = memory.memory.length + 3; // "- " prefix + newline
    if (totalChars + memoryChars > MEMORY_BUDGET.MAX_CHARS) break;

    budgetedMemories.push(memory);
    totalChars += memoryChars;
  }

  return budgetedMemories;
}

export async function parseReferences(content: string): Promise<{
  cleanContent: string;
  fileReferences: Array<{ id: string; name: string }>;
  chatReferences: Array<{ id: string; name: string }>;
  agentReferences: Array<{ id: string; name: string }>;
  webReferences?: string[];
  notionReferences?: string[];
}> {
  const fileReferences: Array<{ id: string; name: string }> = [];
  const chatReferences: Array<{ id: string; name: string }> = [];
  const agentReferences: Array<{ id: string; name: string }> = [];

  // Extract file references: @file:id[name]
  const fileMatches = content.matchAll(/@file:([^\[]+)\[([^\]]+)\]/g);
  for (const match of fileMatches) {
    fileReferences.push({ id: match[1], name: match[2] });
  }

  // Extract chat references: @chat:id[name]
  const chatMatches = content.matchAll(/@chat:([^\[]+)\[([^\]]+)\]/g);
  for (const match of chatMatches) {
    chatReferences.push({ id: match[1], name: match[2] });
  }

  // Extract agent references: @agent:id[name]
  const agentMatches = content.matchAll(/@agent:([^\[]+)\[([^\]]+)\]/g);
  for (const match of agentMatches) {
    agentReferences.push({ id: match[1], name: match[2] });
  }

  // Extract web references: @web:query
  const webMatches = content.matchAll(/@web:([^\n]+)/g);
  const webReferences: string[] = [];
  for (const match of webMatches) {
    webReferences.push(match[1]);
  }

  // Extract notion references: @notion:query
  const notionMatches = content.matchAll(/@notion:([^\n]+)/g);
  const notionReferences: string[] = [];
  for (const match of notionMatches) {
    notionReferences.push(match[1]);
  }

  // Clean content (remove reference markup but keep names)
  let cleanContent = content;
  cleanContent = cleanContent.replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]");
  cleanContent = cleanContent.replace(/@chat:[^\[]+\[([^\]]+)\]/g, "[$1]");
  cleanContent = cleanContent.replace(/@agent:[^\[]+\[([^\]]+)\]/g, "@$1");
  cleanContent = cleanContent.replace(/@web:([^\n]+)/g, "Search: $1");
  cleanContent = cleanContent.replace(/@notion:([^\n]+)/g, "Notion Search: $1");

  return { cleanContent, fileReferences, chatReferences, agentReferences, webReferences, notionReferences };
}

export async function buildContextMessages(
  userMessage: string,
  chatId: string,
  options?: {
    enableRAG?: boolean;
    ragLimit?: number;
    /** Per-chat memory disable flag (overrides global setting) */
    memoryDisabled?: boolean;
  }
): Promise<Message[]> {
  const messages: Message[] = [];

  // Add user memory context FIRST (personalizes all conversations)
  // Check if memory is enabled:
  // 1. Global setting (default: true)
  // 2. Per-chat override (memoryDisabled option)
  const settings = await getSettings();
  const globalMemoryEnabled = settings?.memoryEnabled ?? true;
  const perChatMemoryDisabled = options?.memoryDisabled ?? false;
  const memoryEnabled = globalMemoryEnabled && !perChatMemoryDisabled;

  if (memoryEnabled) {
    try {
      const memoryQuery = userMessage;
      const rawMemories = await searchMemories(memoryQuery);

      if (rawMemories && rawMemories.length > 0) {
        // Apply budgeting: relevance filter, item limit, token/char limit
        const budgetedMemories = budgetMemories(rawMemories);

        if (budgetedMemories.length > 0) {
          // Format memories into a single context string
          const memoryContext = "Active Memories:\n" + budgetedMemories.map((m) => `- ${m.memory}`).join("\n");
          const memoryTokens = Math.ceil(memoryContext.length / 4); // ~4 chars per token

          messages.push({
            id: "memory-context",
            chatId,
            role: "system",
            content: memoryContext,
            createdAt: Date.now(),
          });

          // Log with budget info
          const filtered = rawMemories.length - budgetedMemories.length;
          console.log(`[Context] 🧠 Memories: ${budgetedMemories.length}/${rawMemories.length} items (${filtered} filtered), ~${memoryTokens} tokens`);
        } else {
          console.log(`[Context] 🧠 Memories: 0 items passed relevance filter (${rawMemories.length} raw)`);
        }
      }
    } catch (error) {
      console.error("[Context] Failed to load memory context:", error);
      // Continue without memory if it fails
    }
  } else if (perChatMemoryDisabled) {
    console.log(`[Context] 🧠 Memory disabled for this chat`);
  }

  // Parse references from user message
  const { cleanContent, fileReferences, chatReferences, agentReferences, webReferences, notionReferences } = await parseReferences(userMessage);

  // Web Search
  for (const query of (webReferences || [])) {
    messages.push({
      id: `web-search-${Date.now()}`,
      chatId,
      role: "system",
      content: `PERFORMING WEB SEARCH FOR: "${query}"\n\n[System Note: Web search integration pending. In a real scenario, search results would be injected here.]\n\nSimulated Result:\n- Found 3 sources regarding "${query}"\n- Source A: ...\n- Source B: ...`,
      createdAt: Date.now()
    });
  }

  // Connector Search (Notion)
  if (notionReferences && notionReferences.length > 0) {
    try {
      const { getConnector } = await import("@/lib/connectors/registry");
      const notion = getConnector("notion");
      if (notion && await notion.isConnected()) {
        for (const query of notionReferences) {
          const docs = await notion.search(query);
          const docsText = docs.map(d => `- [${d.title}](${d.url}): ${d.snippet}`).join("\n");

          messages.push({
            id: `notion-search-${Date.now()}`,
            chatId,
            role: "system",
            content: `SEARCHING CONNECTED NOTION WORKSPACE FOR: "${query}"\n\nFound Documents:\n${docsText}`,
            createdAt: Date.now()
          });
        }
      }
    } catch (error) {
      console.error("Failed to perform notion search", error);
    }
  }

  // RAG retrieval if enabled
  if (options?.enableRAG) {
    try {
      const chat = await getChatById(chatId);
      const ragResults = await retrieveContext(cleanContent, {
        chatId,
        projectId: chat?.projectId,
        limit: options.ragLimit || 3,
        threshold: 0.6,
      });

      if (ragResults.length > 0) {
        const ragContext = ragResults
          .map((result, idx) => `[Context ${idx + 1} (similarity: ${(result.similarity * 100).toFixed(1)}%)]\n${result.text}`)
          .join("\n\n---\n\n");

        messages.push({
          id: "rag-context",
          chatId,
          role: "system",
          content: `Relevant context from previous conversations:\n\n${ragContext}`,
          createdAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("RAG retrieval failed:", error);
      // Continue without RAG if it fails
    }
  }

  // Get chat to access project and model
  const chat = await getChatById(chatId);

  // Add model alias system prompt if exists
  if (chat?.modelId) {
    try {
      const alias = await getModelAlias(chat.modelId);
      if (alias?.systemPrompt) {
        const aliasTokens = Math.ceil(alias.systemPrompt.length / 4);
        messages.push({
          id: `system-model-alias-${chat.modelId}`,
          chatId,
          role: "system",
          content: alias.systemPrompt,
          createdAt: Date.now(),
        });
        console.log(`[Context] 🏷️ Model alias prompt: ~${aliasTokens} tokens`);
      }
    } catch (error) {
      console.error("Failed to load model alias:", error);
    }
  }

  // Add agent system prompt if exists (BASE AGENT from Chat Settings)
  if (chat?.agentId) {
    try {
      const agent = await getAgentById(chat.agentId);
      if (agent?.isActive && agent.systemPrompt) {
        const agentTokens = Math.ceil(agent.systemPrompt.length / 4);
        messages.push({
          id: `system-agent-${agent.id}`,
          chatId,
          role: "system",
          content: agent.systemPrompt,
          createdAt: Date.now(),
        });
        console.log(`[Context] 🤖 Agent "${agent.name}" prompt: ~${agentTokens} tokens`);
      }
    } catch (error) {
      console.error("Failed to load agent:", error);
    }
  }

  // Add INVOKED AGENTS (from @mentions) - These act as temporary persona overrides or supplements
  for (const agentRef of agentReferences) {
    try {
      const agent = await getAgentById(agentRef.id);
      if (agent && agent.systemPrompt) {
        messages.push({
          id: `invoked-agent-${agent.id}`,
          chatId,
          role: "system",
          content: `INVOKED AGENT: ${agent.name}\nINSTRUCTIONS:\n${agent.systemPrompt}`,
          createdAt: Date.now(),
        });
      }
    } catch (error) {
      console.error(`Failed to load invoked agent ${agentRef.name}:`, error);
    }
  }

  // Add project system prompt if exists
  if (chat?.projectId) {
    const { getProjectById } = await import("@/lib/db/queries");
    const project = await getProjectById(chat.projectId);
    if (project?.systemPrompt) {
      messages.push({
        id: "system-project",
        chatId,
        role: "system",
        content: project.systemPrompt,
        createdAt: Date.now(),
      });
    }
  }

  // Add file contents as context
  for (const fileRef of fileReferences) {
    try {
      const file = await getProjectFileById(fileRef.id);
      if (file && file.text) {
        messages.push({
          id: `file-${fileRef.id}`,
          chatId,
          role: "system",
          content: `File: ${file.name}\n\`\`\`\n${file.text}\n\`\`\``,
          createdAt: Date.now(),
        });
      }
    } catch (error) {
      console.error(`Failed to load file ${fileRef.name}:`, error);
    }
  }

  // Add chat contents as context
  for (const chatRef of chatReferences) {
    try {
      const refChat = await getChatById(chatRef.id);
      const refMessages = await getMessages(chatRef.id);

      if (refChat && refMessages.length > 0) {
        // Summarize or include recent messages
        const recentMessages = refMessages.slice(-10); // Last 10 messages
        const summary = recentMessages
          .map((m) => `${m.role}: ${getTextFromMessageContent(m.content)}`)
          .join("\n\n");

        messages.push({
          id: `chat-${chatRef.id}`,
          chatId,
          role: "system",
          content: `Referenced chat: ${refChat.title}\n\nRecent messages:\n${summary}`,
          createdAt: Date.now(),
        });
      }
    } catch (error) {
      console.error(`Failed to load chat ${chatRef.name}:`, error);
    }
  }

  return messages;
}
