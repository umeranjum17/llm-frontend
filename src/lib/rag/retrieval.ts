import { searchSimilar, storeDocument } from "./vector-store";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import type { Message } from "@/lib/db/schema";

/**
 * Index a message for RAG retrieval
 */
export async function indexMessage(message: Message): Promise<void> {
  const text = getTextFromMessageContent(message.content);
  if (!text || text.trim().length === 0) {
    return;
  }

  // Split long messages into chunks (max 500 tokens ~ 2000 chars)
  const chunks = chunkText(text, 2000);
  
  for (let i = 0; i < chunks.length; i++) {
    await storeDocument({
      id: `${message.id}-chunk-${i}`,
      text: chunks[i],
      metadata: {
        chatId: message.chatId,
        messageId: message.id,
        timestamp: message.createdAt,
      },
    });
  }
}

/**
 * Retrieve relevant context for a query
 */
export async function retrieveContext(
  query: string,
  options: {
    chatId?: string;
    projectId?: string;
    limit?: number;
    threshold?: number;
  } = {}
): Promise<Array<{ text: string; similarity: number; metadata?: any }>> {
  const results = await searchSimilar(query, options.limit || 5, options.threshold || 0.5, {
    chatId: options.chatId,
    projectId: options.projectId,
  });

  return results.map((result) => ({
    text: result.text,
    similarity: result.similarity,
    metadata: result.metadata,
  }));
}

/**
 * Chunk text into smaller pieces for better retrieval.
 * Uses sentence splitting with configurable overlap for context continuity.
 */
export function chunkText(text: string, maxChunkSize: number, overlapSize: number = Math.floor(maxChunkSize * 0.12)): string[] {
  const chunks: string[] = [];
  // Split on sentence boundaries (.!?) and also on double newlines (paragraphs)
  const sentences = text.split(/(?<=[.!?])\s+|\n{2,}/);

  let currentChunk = "";
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      const trimmed = currentChunk.trim();
      if (trimmed) chunks.push(trimmed);
      // Keep the tail of the previous chunk as overlap for context continuity
      currentChunk = overlapSize > 0 ? trimmed.slice(-overlapSize) + " " : "";
    }
    // Hard-split sentences that exceed maxChunkSize on their own
    if (sentence.length > maxChunkSize) {
      for (let i = 0; i < sentence.length; i += maxChunkSize) {
        chunks.push(sentence.slice(i, i + maxChunkSize));
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}




