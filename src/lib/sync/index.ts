/**
 * Delta Sync - Export all sync functionality
 */

// Device ID and configuration
export {
  getDeviceId,
  getLastSyncTime,
  setLastSyncTime,
  getS3Config,
  setS3Config,
} from "./device-id";

// Change tracking
export {
  initializeChangeTracking,
  getPendingChanges,
  clearPendingChanges,
  getPendingChangesCount,
  setApplyingRemoteChanges,
} from "./change-tracker";

// S3 operations
export { S3Adapter } from "./s3-adapter";

// Apply changes
export { applyChange, applyChanges } from "./apply-change";

// Sync manager
export {
  sync,
  isSyncConfigured,
  getSyncStatus,
  type SyncResult,
  type SyncProgress,
} from "./sync-manager";

// Re-export migration utilities from db folder (not sync-specific)
export { checkMigration, forceMigration } from "@/lib/db/migration";
