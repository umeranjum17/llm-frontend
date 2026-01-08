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
 * Chunk text into smaller pieces for better retrieval
 */
function chunkText(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  let currentChunk = "";
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}




