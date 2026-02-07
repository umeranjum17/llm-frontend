import { db, type Chat, type Message } from "./schema";
import { getTextFromMessageContent } from "@/lib/utils/message-content";

export type ExportFormat = "markdown" | "json";

export interface ChatExport {
  chat: Chat;
  messages: Message[];
  exportedAt: number;
  format: ExportFormat;
}

/**
 * Gets a chat with all its messages for export
 */
export async function getChatForExport(chatId: string): Promise<ChatExport | null> {
  const chat = await db.chats.get(chatId);
  if (!chat) return null;

  const messages = await db.messages
    .where("chatId")
    .equals(chatId)
    .sortBy("createdAt");

  return {
    chat,
    messages,
    exportedAt: Date.now(),
    format: "json",
  };
}

/**
 * Converts a chat export to Markdown format
 */
export function chatToMarkdown(data: ChatExport): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${data.chat.title}`);
  lines.push("");
  lines.push(`**Target:** ${data.chat.executionTarget ?? "lumina"}`);
  lines.push("");
  lines.push(`**Model:** ${data.chat.modelId}`);
  if (data.chat.agentId) {
    lines.push(`**Agent:** ${data.chat.agentId}`);
  }
  lines.push(`**Created:** ${new Date(data.chat.createdAt).toLocaleString()}`);
  lines.push(`**Exported:** ${new Date(data.exportedAt).toLocaleString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Messages
  for (const message of data.messages) {
    if (message.role === "system") continue; // Skip system messages in export

    const roleLabel = message.role === "user" ? "**You:**" : "**Assistant:**";
    const content = getTextFromMessageContent(message.content);

    lines.push(roleLabel);
    lines.push("");
    lines.push(content);
    lines.push("");

    // Add reasoning if present
    if (message.reasoning) {
      lines.push("<details>");
      lines.push("<summary>Reasoning</summary>");
      lines.push("");
      lines.push(message.reasoning);
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // Footer with stats
  if (data.chat.totalCost) {
    lines.push(`*Total cost: $${data.chat.totalCost.toFixed(4)}*`);
  }

  return lines.join("\n");
}

/**
 * Converts a chat export to JSON format
 */
export function chatToJson(data: ChatExport): string {
  // Clean up the data for export (remove internal fields)
  const exportData = {
    title: data.chat.title,
    executionTarget: data.chat.executionTarget ?? "lumina",
    model: data.chat.modelId,
    agent: data.chat.agentId,
    created: new Date(data.chat.createdAt).toISOString(),
    exported: new Date(data.exportedAt).toISOString(),
    messages: data.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role,
        content: getTextFromMessageContent(m.content),
        reasoning: m.reasoning,
        timestamp: new Date(m.createdAt).toISOString(),
        tokens: m.inputTokens || m.outputTokens
          ? { input: m.inputTokens, output: m.outputTokens }
          : undefined,
        cost: m.cost,
      })),
    totalCost: data.chat.totalCost,
    summary: data.chat.summary,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Downloads a chat as a file
 */
export function downloadChat(
  data: ChatExport,
  format: ExportFormat
): void {
  const content = format === "markdown" ? chatToMarkdown(data) : chatToJson(data);
  const mimeType = format === "markdown" ? "text/markdown" : "application/json";
  const extension = format === "markdown" ? "md" : "json";

  // Create safe filename from title
  const safeTitle = data.chat.title
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 50);

  const filename = `${safeTitle}-${new Date().toISOString().split("T")[0]}.${extension}`;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copies chat content to clipboard
 */
export async function copyChatToClipboard(
  data: ChatExport,
  format: ExportFormat
): Promise<void> {
  const content = format === "markdown" ? chatToMarkdown(data) : chatToJson(data);
  await navigator.clipboard.writeText(content);
}
