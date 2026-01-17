import { getProjectFileById, getMessages, getChatById, getAgentById, getModelAlias, getSettings } from "@/lib/db/queries";
import type { Message, Skill } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { retrieveContext } from "@/lib/rag/retrieval";
import { searchMemories, getAllMemories, type MemoryItem } from "@/lib/memory";

/**
 * Memory injection budget constants.
 *
 * Research shows memory helps, but only when bounded and relevance-scored.
 * Balanced limits to include relevant memories without polluting context.
 */
export const MEMORY_BUDGET = {
  /** Maximum tokens for memory context (~4 chars per token) */
  MAX_TOKENS: 1000,
  /** Maximum characters for memory context */
  MAX_CHARS: 4000, // 1000 * 4
  /** Maximum number of memory items to include */
  MAX_ITEMS: 8,
  /** Minimum relevance score (0-1) for inclusion - balanced threshold */
  MIN_RELEVANCE: 0.5,
} as const;

/**
 * Filter and budget memories based on relevance and token limits.
 */
function budgetMemories(memories: MemoryItem[]): MemoryItem[] {
  console.log(`[Memory Budget] Input: ${memories.length} memories`);

  // Log scores for debugging
  if (memories.length > 0) {
    const scores = memories.map(m => m.score).filter(s => s !== undefined && s !== null);
    if (scores.length > 0) {
      console.log(`[Memory Budget] Scores: min=${Math.min(...scores).toFixed(2)}, max=${Math.max(...scores).toFixed(2)}, threshold=${MEMORY_BUDGET.MIN_RELEVANCE}`);
    } else {
      console.log(`[Memory Budget] No scores returned - including all memories`);
    }
  }

  // Filter by relevance score (if available)
  const relevantMemories = memories.filter(m => {
    // If no score available, include it (backend didn't return scores)
    if (m.score === undefined || m.score === null) return true;
    const passes = m.score >= MEMORY_BUDGET.MIN_RELEVANCE;
    if (!passes) {
      console.log(`[Memory Budget] Filtered out (score ${m.score?.toFixed(2)}): "${m.memory.slice(0, 50)}..."`);
    }
    return passes;
  });

  console.log(`[Memory Budget] After relevance filter: ${relevantMemories.length} memories`);

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

  console.log(`[Memory Budget] Final: ${budgetedMemories.length} memories, ${totalChars} chars`);
  return budgetedMemories;
}

function isIdentityQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bwho\s+am\s+i\b/.test(t) ||
    /\bwhat\s+do\s+you\s+know\s+about\s+me\b/.test(t) ||
    /\bdo\s+you\s+know\s+me\b/.test(t) ||
    /\bwhat\s+is\s+my\s+name\b/.test(t)
  );
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
    /** Active skill to inject systemPrompt from */
    skill?: Skill | null;
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

      console.log(`[Context] 🧠 Memory search returned ${rawMemories?.length ?? 0} items for query: "${memoryQuery.slice(0, 50)}..."`);

      // Apply budgeting: relevance filter, item limit, token/char limit
      let budgetedMemories = rawMemories && rawMemories.length > 0 ? budgetMemories(rawMemories) : [];

      // Identity questions should never come back empty if any memories exist.
      // If search returns nothing (or everything filtered out), fall back to "all memories".
      if (budgetedMemories.length === 0 && isIdentityQuestion(userMessage)) {
        const all = await getAllMemories();
        budgetedMemories = all && all.length > 0 ? budgetMemories(all) : [];
        console.log(`[Context] 🧠 Identity fallback used: ${budgetedMemories.length}/${all?.length ?? 0} items`);
      }

      if (budgetedMemories.length > 0) {
        const rawLen = rawMemories?.length ?? 0;
        const filtered = rawLen > 0 ? rawLen - budgetedMemories.length : 0;

        // Format memories with clear instructions for the model
        const memoryContext = `## User Memory (Personal Context)
The following are stored memories about this user. Use this information to personalize responses and answer questions about the user WITHOUT using external tools or web search:

${budgetedMemories.map((m) => `- ${m.memory}`).join("\n")}

When the user asks "what do you know about me" or similar personal questions, refer to these memories first.`;
        const memoryTokens = Math.ceil(memoryContext.length / 4); // ~4 chars per token

        messages.push({
          id: "memory-context",
          chatId,
          role: "system",
          content: memoryContext,
          createdAt: Date.now(),
        });

        // Log with budget info
        console.log(`[Context] 🧠 Memories: ${budgetedMemories.length}/${rawLen} items (${filtered} filtered), ~${memoryTokens} tokens`);
      } else if (rawMemories && rawMemories.length > 0) {
        console.log(`[Context] 🧠 Memories: 0 items passed relevance filter (${rawMemories.length} raw)`);
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

  // Add skill system prompt if skill is active (injected based on semantic match or manual selection)
  if (options?.skill?.systemPrompt) {
    const skillTokens = Math.ceil(options.skill.systemPrompt.length / 4);
    messages.push({
      id: `system-skill-${options.skill.id}`,
      chatId,
      role: "system",
      content: `## Skill: ${options.skill.name}\n\n${options.skill.systemPrompt}`,
      createdAt: Date.now(),
    });
    console.log(`[Context] ⚡ Skill "${options.skill.name}" prompt: ~${skillTokens} tokens`);
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
