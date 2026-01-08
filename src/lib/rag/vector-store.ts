import { generateEmbedding, generateEmbeddings, cosineSimilarity } from "./embeddings";
import { db } from "@/lib/db/schema";

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata?: {
    chatId?: string;
    messageId?: string;
    projectId?: string;
    fileId?: string;
    timestamp?: number;
  };
}

/**
 * Store a document with its embedding in IndexedDB
 */
export async function storeDocument(doc: Omit<VectorDocument, "embedding">): Promise<void> {
  try {
    const embedding = await generateEmbedding(doc.text);
    
    await db.vectorDocuments.add({
      ...doc,
      embedding,
    });
  } catch (error) {
    console.error("Error storing document:", error);
    throw error;
  }
}

/**
 * Store multiple documents with embeddings
 */
export async function storeDocuments(
  docs: Omit<VectorDocument, "embedding">[]
): Promise<void> {
  try {
    // Generate embeddings in batch
    const texts = docs.map((doc) => doc.text);
    const embeddings = await generateEmbeddings(texts);
    
    // Store documents with embeddings
    const documentsWithEmbeddings = docs.map((doc, index) => ({
      ...doc,
      embedding: embeddings[index],
    }));
    
    await db.vectorDocuments.bulkAdd(documentsWithEmbeddings);
  } catch (error) {
    console.error("Error storing documents:", error);
    throw error;
  }
}

/**
 * Search for similar documents using cosine similarity
 */
export async function searchSimilar(
  query: string,
  limit: number = 5,
  threshold: number = 0.5,
  filters?: {
    chatId?: string;
    projectId?: string;
  }
): Promise<Array<VectorDocument & { similarity: number }>> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    
    // Get all documents (or filtered)
    let documents: VectorDocument[];
    if (filters) {
      // Filter documents in memory since Dexie doesn't support nested field queries easily
      const allDocuments = await db.vectorDocuments.toArray();
      documents = allDocuments.filter((doc) => {
        if (filters.chatId && doc.metadata?.chatId !== filters.chatId) {
          return false;
        }
        if (filters.projectId && doc.metadata?.projectId !== filters.projectId) {
          return false;
        }
        return true;
      });
    } else {
      documents = await db.vectorDocuments.toArray();
    }
    
    // Calculate similarities
    const results = documents
      .map((doc) => ({
        ...doc,
        similarity: cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .filter((result) => result.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    return results;
  } catch (error) {
    console.error("Error searching similar documents:", error);
    throw error;
  }
}

/**
 * Delete documents by filter
 */
export async function deleteDocuments(filters: {
  chatId?: string;
  projectId?: string;
  messageId?: string;
}): Promise<void> {
  try {
    // Get all documents and filter in memory
    const allDocuments = await db.vectorDocuments.toArray();
    const idsToDelete = allDocuments
      .filter((doc) => {
        if (filters.messageId && doc.metadata?.messageId === filters.messageId) {
          return true;
        }
        if (filters.chatId && doc.metadata?.chatId === filters.chatId) {
          return true;
        }
        if (filters.projectId && doc.metadata?.projectId === filters.projectId) {
          return true;
        }
        return false;
      })
      .map((doc) => doc.id);

    if (idsToDelete.length > 0) {
      await db.vectorDocuments.bulkDelete(idsToDelete);
    }
  } catch (error) {
    console.error("Error deleting documents:", error);
    throw error;
  }
}
