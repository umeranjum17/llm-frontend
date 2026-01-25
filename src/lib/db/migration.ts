import { db, DB_SCHEMA_VERSION } from "@/lib/db/schema";
import { backupDatabase, restoreDatabase } from "./backup-recovery";
import { getRequiredTablesForVersion } from "./table-registry";

/**
 * Check if database needs migration by comparing version numbers.
 * Dexie handles schema creation automatically during upgrade.
 */
export async function checkMigration(): Promise<{
  needsMigration: boolean;
  currentVersion: number;
  targetVersion: number;
  message?: string;
}> {
  try {
    const currentVersion = db.verno;
    const targetVersion = DB_SCHEMA_VERSION;

    if (currentVersion < targetVersion) {
      return {
        needsMigration: true,
        currentVersion,
        targetVersion,
        message: `Database needs migration from v${currentVersion} to v${targetVersion}`,
      };
    }

    return {
      needsMigration: false,
      currentVersion,
      targetVersion,
    };
  } catch (error) {
    console.error("[Migration] Error checking migration status:", error);
    return {
      needsMigration: true,
      currentVersion: 0,
      targetVersion: DB_SCHEMA_VERSION,
      message: "Unable to check migration status",
    };
  }
}

function getMissingTables(requiredTables: string[]): string[] {
  const idb = db.backendDB();
  if (!idb) {
    return requiredTables;
  }

  const existing = new Set(Array.from(idb.objectStoreNames));
  return requiredTables.filter((table) => !existing.has(table));
}

/**
 * Ensure all required tables exist. If any are missing, treat as corruption
 * and perform backup + recreate + restore.
 */
export async function ensureRequiredTables(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }

  const required = getRequiredTablesForVersion(DB_SCHEMA_VERSION);
  const missing = getMissingTables(required);
  if (missing.length === 0) {
    return;
  }

  console.warn(`[Migration] Missing tables detected: ${missing.join(", ")}`);

  // Recovery path: backup, delete, recreate, restore
  const backup = await backupDatabase();
  console.log(
    `[Migration] ✓ Backed up ${backup.stats.totalRecords} records from ${backup.stats.tablesSucceeded} tables`
  );

  await db.close();
  await db.delete();
  await db.open();

  const { restored, failed } = await restoreDatabase();
  if (restored > 0) {
    console.log(`[Migration] ✓ Restored ${restored} records`);
  }
  if (failed.length > 0) {
    console.warn(`[Migration] Failed to restore tables: ${failed.join(", ")}`);
  }

  const remaining = getMissingTables(required);
  if (remaining.length > 0) {
    throw new Error(`Database recovery failed (missing: ${remaining.join(", ")})`);
  }
}

/**
 * Force database migration by closing and reopening.
 * Dexie handles schema upgrades automatically.
 * Only triggers recovery (backup + delete + restore) if open fails.
 */
export async function forceMigration(): Promise<void> {
  console.log("[Migration] Forcing database migration...");

  try {
    const currentVersion = db.verno;
    console.log(`[Migration] Current: v${currentVersion}, Target: v${DB_SCHEMA_VERSION}`);

    // Close and reopen to trigger Dexie migrations
    await db.close();
    await db.open();

    // Verify version upgraded
    if (db.verno < DB_SCHEMA_VERSION) {
      throw new Error(
        `Migration incomplete - still at v${db.verno}, expected v${DB_SCHEMA_VERSION}`
      );
    }

    console.log("[Migration] ✓ Migration successful");
  } catch (error) {
    console.error("[Migration] Migration failed, attempting recovery:", error);

    // Recovery path: backup, delete, recreate, restore
    try {
      // Backup user data before deletion
      const backup = await backupDatabase();
      console.log(
        `[Migration] ✓ Backed up ${backup.stats.totalRecords} records from ${backup.stats.tablesSucceeded} tables`
      );

      // Close and delete corrupted database
      await db.close();
      await db.delete();

      // Reopen to create fresh database
      await db.open();
      console.log(`[Migration] Fresh database created at version ${db.verno}`);

      // Restore backed up data
      const { restored, failed } = await restoreDatabase();
      if (restored > 0) {
        console.log(`[Migration] ✓ Restored ${restored} records`);
      }
      if (failed.length > 0) {
        console.warn(`[Migration] Failed to restore tables: ${failed.join(", ")}`);
      }

      console.log("[Migration] ✓ Recovery completed");
    } catch (recoveryError) {
      console.error("[Migration] Recovery failed:", recoveryError);
      throw new Error(
        `Migration and recovery both failed: ${(error as Error).message}`
      );
    }
  }
}
