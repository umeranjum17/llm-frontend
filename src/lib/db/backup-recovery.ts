import { db } from "./schema";
import { getBackupTables } from "./table-registry";

const BACKUP_KEY = "lumina_db_corruption_backup";

export interface DatabaseBackup {
  version: number;
  timestamp: number;
  tables: Record<string, any[]>;
  stats: { tablesSucceeded: number; tablesFailed: string[]; totalRecords: number };
}

/**
 * Backup all database tables to localStorage before corruption recovery.
 * This allows us to restore user data after db.delete() + db.open().
 */
export async function backupDatabase(): Promise<DatabaseBackup> {
  console.log("[Backup] Starting database backup...");

  const backup: DatabaseBackup = {
    version: db.verno,
    timestamp: Date.now(),
    tables: {},
    stats: { tablesSucceeded: 0, tablesFailed: [], totalRecords: 0 },
  };

  // All tables that contain user data worth preserving
  // Loaded from centralized table registry
  const tablesToBackup = getBackupTables();

  for (const tableName of tablesToBackup) {
    try {
      const table = (db as any)[tableName];
      if (!table) {
        backup.stats.tablesFailed.push(tableName);
        continue;
      }

      const data = await table.toArray();
      backup.tables[tableName] = data;
      backup.stats.tablesSucceeded++;
      backup.stats.totalRecords += data.length;
      console.log(`[Backup] ✓ ${tableName}: ${data.length} records`);
    } catch (error) {
      console.warn(`[Backup] ✗ ${tableName}: failed`, error);
      backup.stats.tablesFailed.push(tableName);
    }
  }

  // Store in localStorage (limited to ~5MB but sufficient for most users)
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    console.log(
      `[Backup] ✓ Complete: ${backup.stats.totalRecords} records from ${backup.stats.tablesSucceeded} tables`
    );
  } catch (storageError) {
    console.error("[Backup] Failed to save to localStorage:", storageError);
    // Try to save at least critical tables
    const criticalBackup: DatabaseBackup = {
      ...backup,
      tables: {
        settings: backup.tables.settings || [],
        apiKeys: backup.tables.apiKeys || [],
        deviceSecrets: backup.tables.deviceSecrets || [],
        _syncMeta: backup.tables._syncMeta || [],
      },
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(criticalBackup));
    console.log("[Backup] Saved critical tables only due to storage limits");
  }

  return backup;
}

/**
 * Restore database from localStorage backup after recreation.
 * Returns stats about what was restored.
 */
export async function restoreDatabase(): Promise<{
  restored: number;
  failed: string[];
}> {
  const backupJson = localStorage.getItem(BACKUP_KEY);
  if (!backupJson) {
    console.log("[Restore] No backup found");
    return { restored: 0, failed: [] };
  }

  let backup: DatabaseBackup;
  try {
    backup = JSON.parse(backupJson);
  } catch {
    console.error("[Restore] Failed to parse backup");
    localStorage.removeItem(BACKUP_KEY);
    return { restored: 0, failed: [] };
  }

  console.log(
    `[Restore] Restoring from backup (v${backup.version}, ${new Date(backup.timestamp).toISOString()})`
  );

  let totalRestored = 0;
  const failed: string[] = [];

  for (const [tableName, records] of Object.entries(backup.tables)) {
    if (!records?.length) continue;

    try {
      const table = (db as any)[tableName];
      if (!table) {
        console.warn(`[Restore] Table ${tableName} not found in schema`);
        failed.push(tableName);
        continue;
      }

      await table.bulkPut(records);
      totalRestored += records.length;
      console.log(`[Restore] ✓ ${tableName}: ${records.length} records`);
    } catch (error) {
      console.error(`[Restore] ✗ ${tableName}:`, error);
      failed.push(tableName);
    }
  }

  // Clean up backup after successful restore
  localStorage.removeItem(BACKUP_KEY);
  console.log(`[Restore] ✓ Complete: ${totalRestored} records restored`);

  return { restored: totalRestored, failed };
}

/**
 * Check if a backup exists in localStorage.
 */
export function hasBackup(): boolean {
  return localStorage.getItem(BACKUP_KEY) !== null;
}

/**
 * Clear any existing backup (e.g., after successful migration without needing restore).
 */
export function clearBackup(): void {
  localStorage.removeItem(BACKUP_KEY);
}
