import { chunkText } from "./retrieval";
import { storeDocuments } from "./vector-store";
import { db, type ProjectFile } from "@/lib/db/schema";
import { getProjectFiles } from "@/lib/db/queries";

/**
 * Index a project file by chunking its text and storing embeddings.
 */
export async function indexProjectFile(file: ProjectFile): Promise<void> {
  if (!file.text || file.text.trim().length === 0) {
    // Nothing to index, but mark as indexed to avoid perpetual spinner
    await db.projectFiles.update(file.id, { indexed: true });
    return;
  }

  const chunks = chunkText(file.text, 800);

  const docs = chunks.map((chunk, i) => ({
    id: `${file.id}-chunk-${i}`,
    text: chunk,
    metadata: {
      projectId: file.projectId,
      fileId: file.id,
      type: "document" as const,
      chunkIndex: i,
      totalChunks: chunks.length,
    },
  }));

  await storeDocuments(docs);
  await db.projectFiles.update(file.id, { indexed: true });
}

/**
 * Delete all vector documents for a given file.
 */
export async function deleteFileIndex(fileId: string): Promise<void> {
  await db.vectorDocuments.where("metadata.fileId").equals(fileId).delete();
}

/**
 * Re-index all files in a project.
 */
export async function reindexProjectFiles(projectId: string): Promise<void> {
  const files = await getProjectFiles(projectId);

  // Delete only document-type vectors for this project (preserve message-indexed vectors)
  const allProjectDocs = await db.vectorDocuments
    .where("metadata.projectId")
    .equals(projectId)
    .toArray();
  const docIds = allProjectDocs
    .filter((d) => d.metadata?.type === "document")
    .map((d) => d.id);
  if (docIds.length > 0) {
    await db.vectorDocuments.bulkDelete(docIds);
  }

  // Re-index each file
  for (const file of files) {
    await indexProjectFile(file);
  }
}
