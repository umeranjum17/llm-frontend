import { db, DB_SCHEMA_VERSION } from "@/lib/db/schema";

/**
 * Check if database needs migration
 * Uses Dexie's built-in version tracking
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

/**
 * Force database migration by closing and reopening
 * This will trigger Dexie's upgrade handlers for any pending versions
 */
export async function forceMigration(): Promise<void> {
  console.log("[Migration] Forcing database migration...");

  try {
    const currentVersion = db.verno;
    console.log(`[Migration] Current version: ${currentVersion}, Target: ${DB_SCHEMA_VERSION}`);

    // Close the database
    await db.close();
    console.log("[Migration] Database closed");

    // Reopen it - this will trigger Dexie's migration
    await db.open();
    console.log(`[Migration] Database reopened - now at version ${db.verno}`);

    // Verify migration worked
    if (db.verno < DB_SCHEMA_VERSION) {
      throw new Error(`Migration incomplete - still at v${db.verno}, expected v${DB_SCHEMA_VERSION}`);
    }

    console.log("[Migration] ✓ Migration successful");
  } catch (error) {
    console.error("[Migration] Migration failed:", error);
    throw error;
  }
}
