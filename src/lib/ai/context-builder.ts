import { getChatById, getAgentById, getAgentsByIds, getProjectFilesByIds, getChatsWithMessagesByIds, getModelAlias, getSettings } from "@/lib/db/queries";
import type { Message, Skill } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { retrieveContext } from "@/lib/rag/retrieval";
import { searchMemories, getAllMemories, type MemoryItem } from "@/lib/memory";

/**
 * Maximum number of file mentions allowed per message.
 * Prevents context pollution and excessive token usage.
 */
export const MAX_FILE_MENTIONS = 5;

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
 * Build priority header for multiple active contexts.
 * Helps model understand which context takes precedence when conflicting.
 */
function buildPriorityHeader(activeContexts: string[]): string {
  if (activeContexts.length <= 2) return "";
  return `## Context Priority (follow highest when conflicting)\n${activeContexts.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`;
}

/**
 * Filter and budget memories based on relevance and token limits.
 */
function budgetMemories(memories: MemoryItem[]): MemoryItem[] {

  // Log scores for debugging
  if (memories.length > 0) {
    const scores = memories.map(m => m.score).filter(s => s !== undefined && s !== null);
    if (scores.length > 0) {
    } else {
    }
  }

  // Filter by relevance score (if available)
  const relevantMemories = memories.filter(m => {
    // If no score available, include it (backend didn't return scores)
    if (m.score === undefined || m.score === null) return true;
    const passes = m.score >= MEMORY_BUDGET.MIN_RELEVANCE;
    if (!passes) {
    }
    return passes;
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
}> {
  const fileReferences: Array<{ id: string; name: string }> = [];
  const chatReferences: Array<{ id: string; name: string }> = [];
  const agentReferences: Array<{ id: string; name: string }> = [];

  // Extract file references: @file:id[name] (limited to MAX_FILE_MENTIONS)
  const fileMatches = content.matchAll(/@file:([^\[]+)\[([^\]]+)\]/g);
  for (const match of fileMatches) {
    if (fileReferences.length >= MAX_FILE_MENTIONS) {
      console.warn(`[Context] File mention limit (${MAX_FILE_MENTIONS}) reached, ignoring: ${match[2]}`);
      break;
    }
    fileReferences.push({ id: match[1], name: match[2] });
  }

  // Extract chat references: #chat:id[name]
  const chatMatches = content.matchAll(/#chat:([^\[]+)\[([^\]]+)\]/g);
  for (const match of chatMatches) {
    chatReferences.push({ id: match[1], name: match[2] });
  }

  // Extract agent references: @agent:id[name]
  const agentMatches = content.matchAll(/@agent:([^\[]+)\[([^\]]+)\]/g);
  for (const match of agentMatches) {
    agentReferences.push({ id: match[1], name: match[2] });
  }

  // Clean content (remove reference markup but keep names)
  let cleanContent = content;
  cleanContent = cleanContent.replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]");
  cleanContent = cleanContent.replace(/#chat:[^\[]+\[([^\]]+)\]/g, "[$1]");
  cleanContent = cleanContent.replace(/@agent:[^\[]+\[([^\]]+)\]/g, "@$1");

  return { cleanContent, fileReferences, chatReferences, agentReferences };
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
  const activeContexts: string[] = []; // Track active contexts for priority header

  // Parse references from user message FIRST (needed for batch queries)
  const { cleanContent, fileReferences, chatReferences, agentReferences } = await parseReferences(userMessage);

  // Batch fetch all needed data upfront to avoid N+1 queries
  const [settings, chat] = await Promise.all([
    getSettings(),
    getChatById(chatId)
  ]);

  // Batch fetch referenced entities in parallel
  const [invokedAgentsMap, filesMap, referencedChatsMap] = await Promise.all([
    getAgentsByIds(agentReferences.map(a => a.id)),
    getProjectFilesByIds(fileReferences.map(f => f.id)),
    getChatsWithMessagesByIds(chatReferences.map(c => c.id))
  ]);

  // Add user memory context FIRST (personalizes all conversations)
  // Check if memory is enabled:
  // 1. Global setting (default: true)
  // 2. Per-chat override (memoryDisabled option)
  const globalMemoryEnabled = settings?.memoryEnabled ?? true;
  const perChatMemoryDisabled = options?.memoryDisabled ?? false;
  const memoryEnabled = globalMemoryEnabled && !perChatMemoryDisabled;

  if (memoryEnabled) {
    try {
      const memoryQuery = userMessage;
      const rawMemories = await searchMemories(memoryQuery);


      // Apply budgeting: relevance filter, item limit, token/char limit
      let budgetedMemories = rawMemories && rawMemories.length > 0 ? budgetMemories(rawMemories) : [];

      // Identity questions should never come back empty if any memories exist.
      // If search returns nothing (or everything filtered out), fall back to "all memories".
      if (budgetedMemories.length === 0 && isIdentityQuestion(userMessage)) {
        const all = await getAllMemories();
        budgetedMemories = all && all.length > 0 ? budgetMemories(all) : [];
      }

      if (budgetedMemories.length > 0) {
        const rawLen = rawMemories?.length ?? 0;
        const filtered = rawLen > 0 ? rawLen - budgetedMemories.length : 0;

        // Format memories with clear instructions for the model
        const memoryContext = `## User Memory
${budgetedMemories.map((m) => `- ${m.memory}`).join("\n")}

CRITICAL: Use memories ONLY when directly relevant. NEVER:
- Volunteer personal info unprompted
- Reference memories unless user asks about themselves
- Say "I remember you..." or "Based on your memory..."`;
        const memoryTokens = Math.ceil(memoryContext.length / 4); // ~4 chars per token

        messages.push({
          id: "memory-context",
          chatId,
          role: "system",
          content: memoryContext,
          createdAt: Date.now(),
        });
        activeContexts.push("User Memory");

        // Log with budget info
      } else if (rawMemories && rawMemories.length > 0) {
      }
    } catch (error) {
      console.error("[Context] Failed to load memory context:", error);
      // Continue without memory if it fails
    }
  } else if (perChatMemoryDisabled) {
  }

  // RAG retrieval if enabled
  if (options?.enableRAG) {
    try {
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
        activeContexts.push("RAG Context");
      }
    } catch (error) {
      console.error("RAG retrieval failed:", error);
      // Continue without RAG if it fails
    }
  }

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
        activeContexts.push("Model Alias");
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
        activeContexts.push("Agent Instructions");
      }
    } catch (error) {
      console.error("Failed to load agent:", error);
    }
  }

  // Add INVOKED AGENTS (from @mentions) - These act as temporary persona overrides or supplements
  // Uses batch-fetched agents map
  let invokedAgentCount = 0;
  for (const agentRef of agentReferences) {
    const agent = invokedAgentsMap.get(agentRef.id);
    if (agent && agent.systemPrompt) {
      messages.push({
        id: `invoked-agent-${agent.id}`,
        chatId,
        role: "system",
        content: `INVOKED AGENT: ${agent.name}\nINSTRUCTIONS:\n${agent.systemPrompt}`,
        createdAt: Date.now(),
      });
      invokedAgentCount++;
    }
  }
  if (invokedAgentCount > 0) {
    activeContexts.push(`Invoked Agent${invokedAgentCount > 1 ? 's' : ''}`);
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
      activeContexts.push("Project Instructions");
    }
  }

  // Add skill system prompt if skill is active (injected based on semantic match or manual selection)
  if (options?.skill?.systemPrompt) {
    const skillTokens = Math.ceil(options.skill.systemPrompt.length / 4);
    let skillContent = `## Skill: ${options.skill.name}\n\n${options.skill.systemPrompt}`;
    
    // For agent creator/editor skills, inject tool/model context
    const isAgentSkill = options.skill.id === "skill_builtin_agent_creator" || 
                         options.skill.id === "skill_builtin_agent_editor";
    
    if (isAgentSkill && chat) {
      try {
        const response = await fetch("/api/agent-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chat.id,
            mcpServerIds: chat.activeMcpServerIds || [],
          }),
        });
        
        if (response.ok) {
          const { contextMessage } = await response.json();
          skillContent += `\n\n${contextMessage}`;
        }
      } catch (error) {
        console.error("[Context Builder] Failed to fetch agent context:", error);
        // Continue without context - not critical
      }
    }
    
    messages.push({
      id: `system-skill-${options.skill.id}`,
      chatId,
      role: "system",
      content: skillContent,
      createdAt: Date.now(),
    });
    activeContexts.push("Skill Instructions");
  }

  // Add file contents as context (uses batch-fetched files map)
  for (const fileRef of fileReferences) {
    const file = filesMap.get(fileRef.id);
    if (file && file.text) {
      messages.push({
        id: `file-${fileRef.id}`,
        chatId,
        role: "system",
        content: `File: ${file.name}\n\`\`\`\n${file.text}\n\`\`\``,
        createdAt: Date.now(),
      });
    }
  }

  // Add chat contents as context (uses batch-fetched chats map)
  for (const chatRef of chatReferences) {
    const refData = referencedChatsMap.get(chatRef.id);
    if (refData && refData.messages.length > 0) {
      // Summarize or include recent messages
      const recentMessages = refData.messages.slice(-10); // Last 10 messages
      const summary = recentMessages
        .map((m) => `${m.role}: ${getTextFromMessageContent(m.content)}`)
        .join("\n\n");

      messages.push({
        id: `chat-${chatRef.id}`,
        chatId,
        role: "system",
        content: `Referenced chat: ${refData.chat.title}\n\nRecent messages:\n${summary}`,
        createdAt: Date.now(),
      });
    }
  }

  // Prepend priority header if multiple contexts are active (helps model resolve conflicts)
  const priorityHeader = buildPriorityHeader(activeContexts.reverse()); // Highest priority first
  if (priorityHeader) {
    messages.unshift({
      id: "context-priority",
      chatId,
      role: "system",
      content: priorityHeader,
      createdAt: Date.now(),
    });
  }

  return messages;
}
