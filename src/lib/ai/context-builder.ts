import { getProjectFileById, getMessages, getChatById, getAgentById } from "@/lib/db/queries";
import type { Message } from "@/lib/db/schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";

export async function parseReferences(content: string): Promise<{
  cleanContent: string;
  fileReferences: Array<{ id: string; name: string }>;
  chatReferences: Array<{ id: string; name: string }>;
}> {
  const fileReferences: Array<{ id: string; name: string }> = [];
  const chatReferences: Array<{ id: string; name: string }> = [];

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

  // Clean content (remove reference markup but keep names)
  let cleanContent = content;
  cleanContent = cleanContent.replace(/@file:[^\[]+\[([^\]]+)\]/g, "[$1]");
  cleanContent = cleanContent.replace(/@chat:[^\[]+\[([^\]]+)\]/g, "[$1]");

  return { cleanContent, fileReferences, chatReferences };
}

export async function buildContextMessages(
  userMessage: string,
  chatId: string
): Promise<Message[]> {
  const messages: Message[] = [];

  // Parse references from user message
  const { cleanContent, fileReferences, chatReferences } = await parseReferences(userMessage);

  // Get chat to access project
  const chat = await getChatById(chatId);

  // Add agent system prompt if exists
  if (chat?.agentId) {
    try {
      const agent = await getAgentById(chat.agentId);
      if (agent?.isActive && agent.systemPrompt) {
        messages.push({
          id: `system-agent-${agent.id}`,
          chatId,
          role: "system",
          content: agent.systemPrompt,
          createdAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("Failed to load agent:", error);
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
