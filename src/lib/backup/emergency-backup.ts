/**
 * Emergency Backup System
 *
 * Auto-backup critical settings to localStorage before any destructive action.
 * Compressed JSON that stays local and survives cache clear.
 *
 * This is a safety net for PWA cache/service worker updates that may
 * trigger database health checks leading to accidental data loss.
 */

import { db } from "@/lib/db/schema";

const EMERGENCY_BACKUP_KEY = "lumina_emergency_backup";
const BACKUP_VERSION = 1;

interface EmergencyBackupData {
  version: number;
  timestamp: number;
  settings: any;
  apiKeys: any[];
  modelFavorites: any[];
  folders: any[];
  tags: any[];
  parameterPresets: any[];
  agents: any[];
  userMemories: any[];
  mcpServers: any[];
  modelAliases: any[];
}

/**
 * Create an emergency backup of critical user data to localStorage.
 * Should be called before any potentially destructive action (soft refresh, recovery, etc.)
 *
 * Backs up:
 * - Settings
 * - API keys
 * - Model favorites
 * - Folders
 * - Tags
 * - Parameter presets
 * - Agents
 * - User memories
 * - MCP servers
 * - Model aliases
 *
 * Does NOT back up (too large, can be re-fetched):
 * - Chats
 * - Messages
 * - Projects
 * - Vector documents
 * - Skills (built-in can be re-seeded)
 * - Skill embeddings
 */
export async function createEmergencyBackup(): Promise<void> {
  try {
    // Check if database is accessible
    if (!db.isOpen()) {
      console.warn("[Emergency Backup] Database not open, skipping backup");
      return;
    }

    // Gather critical data from IndexedDB
    const [
      settings,
      apiKeys,
      modelFavorites,
      folders,
      tags,
      parameterPresets,
      agents,
      userMemories,
      mcpServers,
      modelAliases,
    ] = await Promise.all([
      db.settings.get("default").catch(() => null),
      db.apiKeys.toArray().catch(() => []),
      db.modelFavorites.toArray().catch(() => []),
      db.folders.toArray().catch(() => []),
      db.tags.toArray().catch(() => []),
      db.parameterPresets.toArray().catch(() => []),
      db.agents.filter((a) => !a.isBuiltIn).toArray().catch(() => []), // Only user-created agents
      db.userMemories.toArray().catch(() => []),
      db.mcpServers.filter((s) => s.collection === "custom").toArray().catch(() => []), // Only custom servers
      db.modelAliases.toArray().catch(() => []),
    ]);

    const backupData: EmergencyBackupData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      settings,
      apiKeys,
      modelFavorites,
      folders,
      tags,
      parameterPresets,
      agents,
      userMemories,
      mcpServers,
      modelAliases,
    };

    // Compress and store in localStorage
    const jsonStr = JSON.stringify(backupData);
    localStorage.setItem(EMERGENCY_BACKUP_KEY, jsonStr);

    console.log(
      `[Emergency Backup] Created backup (${(jsonStr.length / 1024).toFixed(1)}KB) at ${new Date(backupData.timestamp).toISOString()}`
    );
  } catch (error) {
    console.error("[Emergency Backup] Failed to create backup:", error);
    // Don't throw - backup failure shouldn't block recovery actions
  }
}

/**
 * Check if an emergency backup exists in localStorage.
 */
export function hasEmergencyBackup(): boolean {
  try {
    const backup = localStorage.getItem(EMERGENCY_BACKUP_KEY);
    if (!backup) return false;

    const data = JSON.parse(backup) as EmergencyBackupData;
    // Validate basic structure
    return (
      typeof data.version === "number" &&
      typeof data.timestamp === "number" &&
      data.timestamp > 0
    );
  } catch {
    return false;
  }
}

/**
 * Get the timestamp of the emergency backup.
 */
export function getEmergencyBackupTimestamp(): number | null {
  try {
    const backup = localStorage.getItem(EMERGENCY_BACKUP_KEY);
    if (!backup) return null;

    const data = JSON.parse(backup) as EmergencyBackupData;
    return data.timestamp || null;
  } catch {
    return null;
  }
}

/**
 * Restore data from the emergency backup.
 * Returns true if restoration was successful.
 *
 * Note: This will merge/overwrite existing data, not replace it entirely.
 * API keys are handled specially to avoid duplicates.
 */
export async function restoreEmergencyBackup(): Promise<boolean> {
  try {
    const backupStr = localStorage.getItem(EMERGENCY_BACKUP_KEY);
    if (!backupStr) {
      console.warn("[Emergency Backup] No backup found to restore");
      return false;
    }

    const backup = JSON.parse(backupStr) as EmergencyBackupData;

    // Validate backup
    if (backup.version !== BACKUP_VERSION) {
      console.warn(
        `[Emergency Backup] Backup version mismatch: ${backup.version} vs ${BACKUP_VERSION}`
      );
      // Still try to restore - newer versions should be backwards compatible
    }

    // Ensure database is open
    if (!db.isOpen()) {
      await db.open();
    }

    // Restore settings
    if (backup.settings) {
      await db.settings.put(backup.settings);
    }

    // Restore API keys (check for duplicates by provider)
    if (backup.apiKeys?.length > 0) {
      const existingKeys = await db.apiKeys.toArray();
      const existingProviders = new Set(existingKeys.map((k) => k.provider));

      for (const key of backup.apiKeys) {
        if (!existingProviders.has(key.provider)) {
          await db.apiKeys.add(key);
        }
      }
    }

    // Restore model favorites (merge by id)
    if (backup.modelFavorites?.length > 0) {
      for (const fav of backup.modelFavorites) {
        await db.modelFavorites.put(fav);
      }
    }

    // Restore folders (merge by id)
    if (backup.folders?.length > 0) {
      for (const folder of backup.folders) {
        await db.folders.put(folder);
      }
    }

    // Restore tags (merge by id)
    if (backup.tags?.length > 0) {
      for (const tag of backup.tags) {
        await db.tags.put(tag);
      }
    }

    // Restore parameter presets (merge by id)
    if (backup.parameterPresets?.length > 0) {
      for (const preset of backup.parameterPresets) {
        await db.parameterPresets.put(preset);
      }
    }

    // Restore user-created agents (merge by id)
    if (backup.agents?.length > 0) {
      for (const agent of backup.agents) {
        await db.agents.put(agent);
      }
    }

    // Restore user memories (merge by id)
    if (backup.userMemories?.length > 0) {
      for (const memory of backup.userMemories) {
        await db.userMemories.put(memory);
      }
    }

    // Restore custom MCP servers (merge by id)
    if (backup.mcpServers?.length > 0) {
      for (const server of backup.mcpServers) {
        await db.mcpServers.put(server);
      }
    }

    // Restore model aliases (merge by id)
    if (backup.modelAliases?.length > 0) {
      for (const alias of backup.modelAliases) {
        await db.modelAliases.put(alias);
      }
    }

    console.log(
      `[Emergency Backup] Restored backup from ${new Date(backup.timestamp).toISOString()}`
    );
    return true;
  } catch (error) {
    console.error("[Emergency Backup] Failed to restore backup:", error);
    return false;
  }
}

/**
 * Clear the emergency backup from localStorage.
 */
export function clearEmergencyBackup(): void {
  try {
    localStorage.removeItem(EMERGENCY_BACKUP_KEY);
    console.log("[Emergency Backup] Cleared backup");
  } catch (error) {
    console.error("[Emergency Backup] Failed to clear backup:", error);
  }
}

/**
 * Get backup metadata without parsing the full backup.
 */
export function getEmergencyBackupInfo(): {
  exists: boolean;
  timestamp: number | null;
  sizeKB: number | null;
} {
  try {
    const backup = localStorage.getItem(EMERGENCY_BACKUP_KEY);
    if (!backup) {
      return { exists: false, timestamp: null, sizeKB: null };
    }

    const data = JSON.parse(backup) as EmergencyBackupData;
    return {
      exists: true,
      timestamp: data.timestamp,
      sizeKB: Math.round(backup.length / 1024),
    };
  } catch {
    return { exists: false, timestamp: null, sizeKB: null };
  }
}
