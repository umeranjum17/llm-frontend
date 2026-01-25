import { db, type ChangeEntry } from "@/lib/db/schema";
import { setApplyingRemoteChanges } from "./change-tracker";

/**
 * Apply a remote change to the local database
 * Handles conflict resolution (last-write-wins)
 */
export async function applyChange(change: ChangeEntry): Promise<void> {
  // Mark that we're applying remote changes to avoid creating change logs
  setApplyingRemoteChanges(true);

  try {
    const table = db.table(change.table);

    switch (change.operation) {
      case "create":
        await handleCreate(table, change);
        break;

      case "update":
        await handleUpdate(table, change);
        break;

      case "delete":
        await handleDelete(table, change);
        break;
    }
  } catch (error) {
    console.error(`Error applying change for ${change.table}:${change.recordId}:`, error);
    throw error;
  } finally {
    // Reset the flag
    setApplyingRemoteChanges(false);
  }
}

/**
 * Handle create operation
 */
async function handleCreate(table: any, change: ChangeEntry): Promise<void> {
  const existing = await table.get(change.recordId);

  if (!existing) {
    // Record doesn't exist locally, create it
    await table.add(change.data);
  } else {
    // Record exists, check if remote is newer
    const localTimestamp = existing.updatedAt || existing.createdAt || 0;
    const remoteTimestamp = change.timestamp;

    if (remoteTimestamp > localTimestamp) {
      // Remote is newer, replace local
      await table.put({ ...change.data, id: change.recordId });
    }
    // Otherwise, keep local (local is newer)
  }
}

/**
 * Handle update operation
 */
async function handleUpdate(table: any, change: ChangeEntry): Promise<void> {
  const local = await table.get(change.recordId);

  if (!local) {
    // Record doesn't exist locally, create it with full data
    if (change.data) {
      await table.add({ ...change.data, id: change.recordId });
    }
    return;
  }

  // Last-write-wins: only apply if remote is newer
  const localTimestamp = local.updatedAt || local.createdAt || 0;
  const remoteTimestamp = change.timestamp;

  if (remoteTimestamp > localTimestamp) {
    // Apply the update
    if (change.mods) {
      // Apply just the modifications
      await table.update(change.recordId, change.mods);
    } else if (change.data) {
      // Replace with full data
      await table.put({ ...change.data, id: change.recordId });
    }
  }
  // Otherwise, keep local (local is newer or same)
}

/**
 * Handle delete operation
 */
async function handleDelete(table: any, change: ChangeEntry): Promise<void> {
  const local = await table.get(change.recordId);

  if (!local) {
    // Already deleted, nothing to do
    return;
  }

  // Check if local was modified after the delete
  const localTimestamp = local.updatedAt || local.createdAt || 0;
  const remoteTimestamp = change.timestamp;

  if (remoteTimestamp > localTimestamp) {
    // Remote delete is newer, delete local
    await table.delete(change.recordId);
  }
  // Otherwise, keep local (it was modified after the delete)
}

/**
 * Apply multiple changes in order
 */
export async function applyChanges(changes: ChangeEntry[]): Promise<{
  applied: number;
  failed: number;
  errors: Array<{ change: ChangeEntry; error: any }>;
}> {
  const errors: Array<{ change: ChangeEntry; error: any }> = [];
  let applied = 0;

  for (const change of changes) {
    try {
      await applyChange(change);
      applied++;
    } catch (error) {
      errors.push({ change, error });
    }
  }

  return {
    applied,
    failed: errors.length,
    errors,
  };
}
