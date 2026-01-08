import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

let embeddingPipeline: FeatureExtractionPipeline | null = null;

/**
 * Initialize the embedding pipeline (lazy loading)
 */
async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    // Use a lightweight model for embeddings
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2", // Small, fast model (~80MB)
      {
        quantized: true, // Use quantized model for smaller size
      }
    );
  }
  return embeddingPipeline;
}

/**
 * Generate embeddings for a text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const pipeline = await getEmbeddingPipeline();
    const output = await pipeline(text, {
      pooling: "mean",
      normalize: true,
    });
    
    // Convert tensor to array
    return Array.from(output.data);
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const pipeline = await getEmbeddingPipeline();
    const embeddings: number[][] = [];
    
    // Process in batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map((text) =>
          pipeline(text, {
            pooling: "mean",
            normalize: true,
          }).then((output) => Array.from(output.data))
        )
      );
      embeddings.push(...batchEmbeddings);
    }
    
    return embeddings;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same dimension");
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}



