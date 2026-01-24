/**
 * Database Export/Import Module
 *
 * Handles full database export and import using dexie-export-import.
 * Used for cloud sync operations.
 */

import { exportDB, importInto, peakImportFile } from "dexie-export-import";
import { db } from "@/lib/db/schema";

export interface ExportProgress {
  totalRows: number;
  completedRows: number;
  percentage: number;
  currentTable?: string;
}

export interface ImportProgress {
  totalRows: number;
  completedRows: number;
  percentage: number;
  currentTable?: string;
}

export interface ExportResult {
  success: boolean;
  data?: Blob;
  error?: string;
  stats?: {
    tables: number;
    totalRows: number;
    sizeBytes: number;
  };
}

export interface ImportResult {
  success: boolean;
  error?: string;
  stats?: {
    tables: number;
    totalRows: number;
  };
}

export interface ImportPreview {
  success: boolean;
  error?: string;
  info?: {
    databaseName: string;
    databaseVersion: number;
    tables: string[];
    totalRows: number;
  };
}

/**
 * Exports the entire database to a Blob
 *
 * @param progressCallback - Optional callback for progress updates
 */
export async function exportFullDatabase(
  progressCallback?: (progress: ExportProgress) => void
): Promise<ExportResult> {
  try {
    // Ensure database is open
    if (!db.isOpen()) {
      await db.open();
    }

    let totalRows = 0;
    let completedRows = 0;

    // Estimate total rows for progress
    const tables = db.tables;
    for (const table of tables) {
      totalRows += await table.count();
    }

    const blob = await exportDB(db, {
      progressCallback: ({ totalRows: total, completedRows: completed, done }) => {
        if (progressCallback && !done) {
          const t = total ?? 0;
          const c = completed ?? 0;
          completedRows = c;
          progressCallback({
            totalRows: t,
            completedRows: c,
            percentage: t > 0 ? Math.round((c / t) * 100) : 0,
          });
        }
        return true; // Continue export
      },
    });

    return {
      success: true,
      data: blob,
      stats: {
        tables: tables.length,
        totalRows,
        sizeBytes: blob.size,
      },
    };
  } catch (error) {
    const err = error as Error;
    console.error("[CloudSync] Export failed:", err);
    return {
      success: false,
      error: err.message || "Failed to export database",
    };
  }
}

/**
 * Imports data from a Blob, replacing the existing database
 *
 * CAUTION: This will clear all existing data!
 *
 * @param data - The Blob containing the exported database
 * @param progressCallback - Optional callback for progress updates
 */
export async function importFullDatabase(
  data: Blob,
  progressCallback?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  try {
    // Validate the import file first
    const preview = await previewImport(data);
    if (!preview.success) {
      return {
        success: false,
        error: preview.error || "Invalid database file",
      };
    }

    // Close the database before import
    db.close();

    // Import with clearTablesBeforeImport to replace existing data
    await importInto(db, data, {
      clearTablesBeforeImport: true,
      acceptNameDiff: true, // Accept if database name differs
      acceptVersionDiff: true, // Accept version differences (migrations will run)
      progressCallback: ({ totalRows: total, completedRows: completed, done }) => {
        if (progressCallback && !done) {
          const t = total ?? 0;
          const c = completed ?? 0;
          progressCallback({
            totalRows: t,
            completedRows: c,
            percentage: t > 0 ? Math.round((c / t) * 100) : 0,
          });
        }
        return true; // Continue import
      },
    });

    // Reopen the database
    await db.open();

    return {
      success: true,
      stats: preview.info
        ? {
            tables: preview.info.tables.length,
            totalRows: preview.info.totalRows,
          }
        : undefined,
    };
  } catch (error) {
    const err = error as Error;
    console.error("[CloudSync] Import failed:", err);

    // Try to reopen the database even if import failed
    try {
      await db.open();
    } catch {
      console.error("[CloudSync] Failed to reopen database after import error");
    }

    return {
      success: false,
      error: err.message || "Failed to import database",
    };
  }
}

/**
 * Previews an import file without actually importing
 * Useful for validation and showing info to user
 */
export async function previewImport(data: Blob): Promise<ImportPreview> {
  try {
    const info = await peakImportFile(data);

    // Calculate total rows
    let totalRows = 0;
    if (info.data?.tables) {
      for (const table of info.data.tables) {
        totalRows += table.rowCount || 0;
      }
    }

    return {
      success: true,
      info: {
        databaseName: info.data?.databaseName || "Unknown",
        databaseVersion: info.data?.databaseVersion || 0,
        tables: info.data?.tables?.map((t) => t.name) || [],
        totalRows,
      },
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: err.message || "Invalid database file",
    };
  }
}

/**
 * Converts a Blob to a base64 string
 * Useful for storing in localStorage or passing through postMessage
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix if present
      const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts a base64 string back to a Blob
 */
export function base64ToBlob(base64: string, contentType: string = "application/json"): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

/**
 * Gets an estimate of the current database size
 * Useful for showing in UI and detecting large DBs
 */
export async function estimateDatabaseSize(): Promise<{
  success: boolean;
  sizeBytes?: number;
  sizeMB?: number;
  rowCount?: number;
  error?: string;
}> {
  try {
    if (!db.isOpen()) {
      await db.open();
    }

    let totalRows = 0;
    const tables = db.tables;

    for (const table of tables) {
      totalRows += await table.count();
    }

    // Rough estimate: average 500 bytes per row
    // This is a heuristic - actual size varies widely
    const estimatedBytes = totalRows * 500;

    return {
      success: true,
      sizeBytes: estimatedBytes,
      sizeMB: Math.round((estimatedBytes / 1024 / 1024) * 10) / 10,
      rowCount: totalRows,
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: err.message || "Failed to estimate database size",
    };
  }
}

/**
 * Checks if there are any changes since the last sync
 * Uses a simple heuristic based on updatedAt timestamps
 */
export async function hasChangesSince(lastSyncAt: number): Promise<boolean> {
  try {
    if (!db.isOpen()) {
      await db.open();
    }

    // Check chats table for recent updates
    const recentChats = await db.chats.where("updatedAt").above(lastSyncAt).count();
    if (recentChats > 0) return true;

    // Check messages table for recent additions
    const recentMessages = await db.messages.where("createdAt").above(lastSyncAt).count();
    if (recentMessages > 0) return true;

    // Check settings table
    const settings = await db.settings.get("default");
    if (settings && settings.updatedAt > lastSyncAt) return true;

    // Check other frequently updated tables
    const recentAgents = await db.agents.where("updatedAt").above(lastSyncAt).count();
    if (recentAgents > 0) return true;

    const recentMemories = await db.userMemories.where("createdAt").above(lastSyncAt).count();
    if (recentMemories > 0) return true;

    return false;
  } catch (error) {
    console.error("[CloudSync] Error checking for changes:", error);
    // Assume changes exist if we can't check
    return true;
  }
}

/**
 * Gets the most recent update timestamp from the database
 */
export async function getMostRecentUpdateTime(): Promise<number> {
  try {
    if (!db.isOpen()) {
      await db.open();
    }

    let mostRecent = 0;

    // Check chats
    const latestChat = await db.chats.orderBy("updatedAt").last();
    if (latestChat && latestChat.updatedAt > mostRecent) {
      mostRecent = latestChat.updatedAt;
    }

    // Check messages
    const latestMessage = await db.messages.orderBy("createdAt").last();
    if (latestMessage && latestMessage.createdAt > mostRecent) {
      mostRecent = latestMessage.createdAt;
    }

    // Check settings
    const settings = await db.settings.get("default");
    if (settings && settings.updatedAt > mostRecent) {
      mostRecent = settings.updatedAt;
    }

    return mostRecent;
  } catch (error) {
    console.error("[CloudSync] Error getting most recent update time:", error);
    return 0;
  }
}
