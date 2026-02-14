import { generateEmbedding, generateEmbeddings, cosineSimilarity } from "./embeddings";
import { db, type VectorDocument } from "@/lib/db/schema";

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

    await db.vectorDocuments.bulkPut(documentsWithEmbeddings);
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
    type?: "document";
  },
  precomputedEmbedding?: number[]
): Promise<Array<VectorDocument & { similarity: number }>> {
  try {
    const queryEmbedding = precomputedEmbedding ?? await generateEmbedding(query);

    // Get candidate documents using indices where possible
    let documents: VectorDocument[] = [];

    if (filters) {
      if (filters.chatId) {
        // Chat-scoped retrieval
        documents = await db.vectorDocuments
          .where("metadata.chatId")
          .equals(filters.chatId)
          .toArray();
      } else if (filters.projectId) {
        // Project-scoped retrieval
        documents = await db.vectorDocuments
          .where("metadata.projectId")
          .equals(filters.projectId)
          .toArray();
        // Apply type filter if specified (e.g., only "document" vectors)
        if (filters.type) {
          documents = documents.filter(doc => doc.metadata?.type === filters.type);
        }
      } else if (filters.type) {
        // Type-scoped retrieval (e.g. only memories)
        documents = await db.vectorDocuments
          .where("metadata.type")
          .equals(filters.type)
          .toArray();

        // Filter by other fields in memory if needed (compound filtering)
        if (filters.chatId || filters.projectId) {
          documents = documents.filter(doc => {
            if (filters.chatId && doc.metadata?.chatId !== filters.chatId) return false;
            if (filters.projectId && doc.metadata?.projectId !== filters.projectId) return false;
            return true;
          });
        }
      } else {
        // Fallback if filters are empty objects
        documents = await db.vectorDocuments.toArray();
      }
    } else {
      // No filters - rigorous full scan required
      documents = await db.vectorDocuments.toArray();
    }

    // Calculate similarities on the reduced candidate set
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
    // Delete using indices for performance
    if (filters.chatId) {
      await db.vectorDocuments.where("metadata.chatId").equals(filters.chatId).delete();
    } else if (filters.projectId) {
      await db.vectorDocuments.where("metadata.projectId").equals(filters.projectId).delete();
    } else {
      // Fallback for non-indexed or complex cases
      const allDocuments = await db.vectorDocuments.toArray();
      const idsToDelete = allDocuments
        .filter((doc) => {
          if (filters.messageId && doc.metadata?.messageId === filters.messageId) return true;
          if (filters.chatId && doc.metadata?.chatId === filters.chatId) return true;
          if (filters.projectId && doc.metadata?.projectId === filters.projectId) return true;
          return false;
        })
        .map((doc) => doc.id);

      if (idsToDelete.length > 0) {
        await db.vectorDocuments.bulkDelete(idsToDelete);
      }
    }
  } catch (error) {
    console.error("Error deleting documents:", error);
    throw error;
  }
}
