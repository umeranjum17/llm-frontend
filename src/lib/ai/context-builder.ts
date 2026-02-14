import { getChatById, getAgentById, getAgentsByIds, getProjectFilesByIds, getChatsWithMessagesByIds, getModelAlias, getSettings, getAllSkills, getProjectFiles, getChatFiles, getLuminaConfig } from "@/lib/db/queries";
import type { Message, Skill } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { retrieveContext } from "@/lib/rag/retrieval";
import { searchSimilar } from "@/lib/rag/vector-store";
import { searchMemories, getAllMemories, type MemoryItem } from "@/lib/memory";
import { getLuminaGlobalContext } from "@/lib/constants/prompts/capabilities";
import { LuminaClient } from "@/lib/lumina/client";

/**
 * RAG retrieval result type
 */
export interface RagResult {
  text: string;
  similarity: number;
  metadata?: any;
}

/**
 * Codebase search result from Lumina
 */
export interface CodebaseContextResult {
  codebaseName: string;
  file: string;
  name: string;
  type: string;
  language: string;
  lines: string;
  code: string;
}

/**
 * Context builder result with static/dynamic separation for prompt caching.
 *
 * Static messages (agent, project, skill prompts) can be cached across turns.
 * Dynamic context (memory, RAG) changes per turn and should be injected into
 * the current user message to avoid breaking the cache prefix.
 */
export interface ContextBuilderResult {
  /** Static system messages that can be cached across conversation turns */
  staticMessages: Message[];
  /** Dynamic context to inject into current user message (not cached) */
  dynamicContext: {
    memory: MemoryItem[] | null;
    rag: RagResult[] | null;
    codebase: CodebaseContextResult[] | null;
  };
}

/**
 * Format dynamic context (memory + RAG) for injection into user message.
 * Returns empty string if no dynamic context is available.
 *
 * This is called by use-chat.ts to prepend context to the current user message,
 * keeping the conversation history prefix stable for prompt caching.
 */
export function formatDynamicContext(dynamicContext: ContextBuilderResult['dynamicContext']): string {
  const parts: string[] = [];

  // Format memory context - ambient, minimal format to avoid model echoing it back
  if (dynamicContext.memory && dynamicContext.memory.length > 0) {
    const memoryText = dynamicContext.memory.map(m => m.memory).join(', ');
    parts.push(`<context type="user_background" usage="silent_personalization">${memoryText}</context>`);
  }

  // Format RAG context — use source attribution when KB metadata is present
  if (dynamicContext.rag && dynamicContext.rag.length > 0) {
    const isKB = dynamicContext.rag.some(r => r.metadata?.type === "document" && r.metadata?.fileName);
    if (isKB) {
      const ragContext = dynamicContext.rag
        .map((result) => {
          const fileName = result.metadata?.fileName || "unknown";
          const chunkIdx = result.metadata?.chunkIndex;
          const totalChunks = result.metadata?.totalChunks;
          const chunkLabel = chunkIdx != null && totalChunks != null ? `, chunk ${chunkIdx + 1}/${totalChunks}` : "";
          return `[Source: ${fileName}${chunkLabel}]\n${result.text}`;
        })
        .join("\n\n");
      parts.push(`Relevant sources (answer based on these):\n\n${ragContext}\n\nAnswer based on the provided sources. Cite which source you used.`);
    } else {
      const ragContext = dynamicContext.rag
        .map((result, idx) => `[Context ${idx + 1}]\n${result.text}`)
        .join("\n\n---\n\n");
      parts.push(`## Related Context\n${ragContext}`);
    }
  }

  // Format codebase context — code snippets from indexed codebases
  if (dynamicContext.codebase && dynamicContext.codebase.length > 0) {
    const codebaseContext = dynamicContext.codebase
      .map((result) => {
        const header = `[${result.codebaseName}] ${result.file}:${result.lines} (${result.type}: ${result.name})`;
        return `${header}\n\`\`\`${result.language}\n${result.code}\n\`\`\``;
      })
      .join("\n\n");
    parts.push(`## Relevant Code from Codebase\n\n${codebaseContext}`);
  }

  if (parts.length === 0) {
    return '';
  }

  // Return formatted context with separator
  return parts.join("\n\n") + "\n\n---\n\n";
}

// Re-export MemoryItem for use in other modules
export type { MemoryItem } from "@/lib/memory";

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
  MAX_CHARS: 2000,
  /** Maximum number of memory items to include */
  MAX_ITEMS: 5,
  /** Minimum relevance score (0-1) for inclusion - higher threshold reduces noise */
  MIN_RELEVANCE: 0.65,
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
  codebaseReferences: Array<{ id: string; name: string }>;
}> {
  const fileReferences: Array<{ id: string; name: string }> = [];
  const chatReferences: Array<{ id: string; name: string }> = [];
  const agentReferences: Array<{ id: string; name: string }> = [];
  const codebaseReferences: Array<{ id: string; name: string }> = [];

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

  // Extract codebase references: @codebase:id[name]
  const codebaseMatches = content.matchAll(/@codebase:([^\[]+)\[([^\]]+)\]/g);
  for (const match of codebaseMatches) {
    codebaseReferences.push({ id: match[1], name: match[2] });
  }

  // Clean content (remove reference markup but keep names)
  let cleanContent = content;
  cleanContent = cleanContent.replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]");
  cleanContent = cleanContent.replace(/#chat:[^\[]+\[([^\]]+)\]/g, "[$1]");
  cleanContent = cleanContent.replace(/@agent:[^\[]+\[([^\]]+)\]/g, "@$1");
  cleanContent = cleanContent.replace(/@codebase:[^\[]+\[([^\]]+)\]/g, "[$1]");

  return { cleanContent, fileReferences, chatReferences, agentReferences, codebaseReferences };
}

export async function buildContextMessages(
  userMessage: string,
  chatId: string,
  options?: {
    enableRAG?: boolean;
    ragLimit?: number;
    /** Per-chat memory disable flag (overrides global setting) */
    memoryDisabled?: boolean;
    /** Incognito mode - disables memory, tools, auto-extraction */
    incognitoMode?: boolean;
    /** Active skill to inject systemPrompt from */
    skill?: Skill | null;
    /** Pre-computed query embedding from skill matching (avoids duplicate API call) */
    queryEmbedding?: number[];
  }
): Promise<ContextBuilderResult> {
  const messages: Message[] = [];
  const activeContexts: string[] = []; // Track active contexts for priority header

  // Dynamic context - will be injected into current user message, not as system messages
  // This is critical for prompt caching: keeps the static prefix stable across turns
  let dynamicMemory: MemoryItem[] | null = null;
  let dynamicRag: RagResult[] | null = null;
  let dynamicCodebase: CodebaseContextResult[] | null = null;

  // Parse references from user message FIRST (needed for batch queries)
  const { cleanContent, fileReferences, chatReferences, agentReferences, codebaseReferences } = await parseReferences(userMessage);

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

  // ============================================================
  // OPTIMIZED CONTEXT ORDER FOR PROMPT CACHING
  // Static content first (cached across messages) → Dynamic content last
  // ============================================================

  // 0. Global Lumina context (always present, lightweight)
  messages.push({
    id: "system-global-lumina",
    chatId,
    role: "system",
    content: getLuminaGlobalContext(),
    createdAt: Date.now(),
  });

  // 1. Agent system prompt (constant per chat) - Most cacheable
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

  // 2. Project system prompt (constant per project)
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

  // 3. Model alias (constant per model)
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

  // 4. Skill system prompt (changes per skill, but stable within skill usage)
  if (options?.skill?.systemPrompt) {
    const skillTokens = Math.ceil(options.skill.systemPrompt.length / 4);
    let skillContent = `## Skill: ${options.skill.name}\n\n${options.skill.systemPrompt}`;

    // For agent creator/editor skills, inject tool/model context
    const isAgentSkill = options.skill.id === "skill_builtin_agent_creator" ||
                         options.skill.id === "skill_builtin_agent_editor";
    const isSkillEditorSkill = options.skill.id === "skill_builtin_skill_editor";

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

    // For skill editor, inject existing skills context
    if (isSkillEditorSkill) {
      try {
        const allSkills = await getAllSkills();
        const userSkills = allSkills.filter((s: Skill) => !s.isBuiltIn);

        let skillContextMsg = "\n\n## Available Skills for Editing\n\n";

        if (userSkills.length > 0) {
          skillContextMsg += `### User-Created Skills (${userSkills.length})\n`;
          skillContextMsg += "Use the **id** field when outputting edits.\n\n";

          userSkills.slice(0, 20).forEach((skill: Skill) => {
            skillContextMsg += `**${skill.name}** (id: \`${skill.id}\`)\n`;
            skillContextMsg += `- Category: ${skill.category} | ${skill.isEnabled ? "Enabled" : "Disabled"}\n`;
            skillContextMsg += `- Triggers: ${(skill.autoApplyQueries || []).slice(0, 3).join(", ") || "None"}\n`;
            const preview = skill.systemPrompt.slice(0, 100);
            skillContextMsg += `- Prompt: "${preview}${skill.systemPrompt.length > 100 ? "..." : ""}"\n\n`;
          });
        } else {
          skillContextMsg += "No custom skills found. The user may want to create a new skill instead.\n\n";
        }

        // Add built-in skills reference
        const builtInSkills = allSkills.filter((s: Skill) => s.isBuiltIn);
        if (builtInSkills.length > 0) {
          skillContextMsg += `### Built-in Skills (Reference Only)\n`;
          builtInSkills.forEach((skill: Skill) => {
            skillContextMsg += `- **${skill.name}** (\`${skill.id}\`): ${skill.category}\n`;
          });
        }

        skillContent += skillContextMsg;
      } catch (error) {
        console.error("[Context Builder] Failed to fetch skill context:", error);
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

  // 5. Invoked agents (from @mentions - less stable but still relatively static)
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

  // 6. File contents as context (uses batch-fetched files map) - relatively stable
  // Explicit @file: mentions are always injected, even in KB mode
  // Check for chat-level KB files
  const chatKBFiles = chat ? await getChatFiles(chatId) : [];
  const hasChatKB = chatKBFiles.length > 0;
  const isKBMode = chat?.ragEnabled === true && (!!chat?.projectId || hasChatKB);
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
  // NOTE: Only includes static contexts - dynamic ones (memory, RAG) are added after
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

  // ============================================================
  // DYNAMIC CONTENT - Added as system messages AFTER static content
  // These change per-message but are placed after conversation history
  // in the final message array (by use-chat.ts) to not break cache prefix
  // ============================================================

  // 8. Memory context (searched per message - DYNAMIC, changes every request)
  const globalMemoryEnabled = settings?.memoryEnabled ?? true;
  const perChatMemoryDisabled = options?.memoryDisabled ?? false;
  const isIncognito = options?.incognitoMode ?? false;
  const memoryEnabled = globalMemoryEnabled && !perChatMemoryDisabled && !isIncognito;

  if (memoryEnabled) {
    try {
      const memoryQuery = userMessage;
      const rawMemories = await searchMemories(memoryQuery, options?.queryEmbedding);

      // Apply budgeting: relevance filter, item limit, token/char limit
      let budgetedMemories = rawMemories && rawMemories.length > 0 ? budgetMemories(rawMemories) : [];

      // Identity questions should never come back empty if any memories exist.
      if (budgetedMemories.length === 0 && isIdentityQuestion(userMessage)) {
        const all = await getAllMemories();
        budgetedMemories = all && all.length > 0 ? budgetMemories(all) : [];
      }

      // Store as dynamic context for later positioning
      if (budgetedMemories.length > 0) {
        dynamicMemory = budgetedMemories;
      }
    } catch (error) {
      console.error("[Context] Failed to load memory context:", error);
    }
  }

  // 9a. Knowledge Base RAG retrieval (when ragEnabled on chat)
  if (isKBMode) {
    try {
      // Search project-level KB files
      let allKBResults: Array<{ text: string; similarity: number; metadata?: any }> = [];

      if (chat?.projectId) {
        const projectResults = await searchSimilar(cleanContent, 8, 0.4, {
          projectId: chat.projectId,
          type: "document",
        });
        allKBResults.push(...projectResults);
      }

      // Search chat-level KB files
      if (hasChatKB) {
        const chatResults = await searchSimilar(cleanContent, 8, 0.4, {
          chatId,
          type: "document",
        });
        allKBResults.push(...chatResults);
      }

      // Deduplicate and sort by similarity
      if (allKBResults.length > 0) {
        const seen = new Set<string>();
        allKBResults = allKBResults.filter(r => {
          const key = r.metadata?.fileId + '-' + r.metadata?.chunkIndex;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        allKBResults.sort((a, b) => b.similarity - a.similarity);
        allKBResults = allKBResults.slice(0, 8);

        // Build file name lookup for source attribution
        const projectFiles = chat?.projectId ? await getProjectFiles(chat.projectId) : [];
        const allFiles = [...projectFiles, ...chatKBFiles];
        const fileNameMap = new Map(allFiles.map(f => [f.id, f.name]));

        dynamicRag = allKBResults.map((r) => {
          const fileName = r.metadata?.fileId ? fileNameMap.get(r.metadata.fileId) || "unknown" : "unknown";
          return {
            text: r.text,
            similarity: r.similarity,
            metadata: { ...r.metadata, fileName },
          };
        });
      }
    } catch (error) {
      console.error("[Context] Knowledge base RAG retrieval failed:", error);
    }
  }

  // 9b. RAG retrieval (DYNAMIC - changes with every query) — skip when KB mode already provided results
  if (options?.enableRAG && !isKBMode) {
    try {
      const ragResults = await retrieveContext(cleanContent, {
        chatId,
        projectId: chat?.projectId,
        limit: options.ragLimit || 3,
        threshold: 0.6,
      });

      // Store as dynamic context for later positioning
      if (ragResults.length > 0) {
        dynamicRag = ragResults;
      }
    } catch (error) {
      console.error("RAG retrieval failed:", error);
    }
  }

  // 10. Codebase context (from @codebase mentions - DYNAMIC, fetched from Lumina)
  if (codebaseReferences.length > 0) {
    try {
      const luminaConfig = await getLuminaConfig();
      if (luminaConfig?.url && luminaConfig?.secret) {
        const luminaClient = new LuminaClient(luminaConfig.url, luminaConfig.secret);

        for (const codebaseRef of codebaseReferences) {
          try {
            // Search the codebase for relevant code based on the user's query
            const searchResult = await luminaClient.searchCodebase(codebaseRef.id, cleanContent, {
              limit: 5,
            });

            if (searchResult.results && searchResult.results.length > 0) {
              const codebaseResults: CodebaseContextResult[] = searchResult.results.map((r) => ({
                codebaseName: codebaseRef.name,
                file: r.file,
                name: r.name,
                type: r.type,
                language: r.language,
                lines: r.lines,
                code: r.code,
              }));

              if (dynamicCodebase) {
                dynamicCodebase.push(...codebaseResults);
              } else {
                dynamicCodebase = codebaseResults;
              }
            }
          } catch (error) {
            console.error(`[Context] Failed to search codebase ${codebaseRef.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("[Context] Failed to load lumina config for codebase search:", error);
    }
  }

  return {
    staticMessages: messages,
    dynamicContext: {
      memory: dynamicMemory,
      rag: dynamicRag,
      codebase: dynamicCodebase,
    },
  };
}
