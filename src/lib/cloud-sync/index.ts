/**
 * Cloud Sync Module
 *
 * Provides seamless background sync to S3/R2 cloud storage.
 * Uses Last-Write-Wins (LWW) conflict resolution strategy.
 */

// Core sync engine
export {
  CloudSyncEngine,
  getSyncEngine,
  destroySyncEngine,
  type SyncResult,
  type SyncStatus,
  type SyncDirection,
  type SyncProgress,
  type SyncEngineState,
} from "./sync-engine";

// S3/R2 client
export {
  createS3Client,
  createS3ClientFromConfig,
  testConnection,
  configureCors,
  uploadData,
  downloadData,
  downloadBlob,
  uploadJSON,
  downloadJSON,
  getObjectMetadata,
  type S3ClientOptions,
  type TestConnectionResult,
  type ObjectMetadata,
} from "./s3-client";

// Manifest management
export {
  readManifest,
  writeManifest,
  createManifest,
  decideSyncDirection,
  calculateChecksum,
  generateDeviceId,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  setDeviceName,
  detectDeviceName,
  formatRelativeTime,
  MANIFEST_KEY,
  DATA_KEY,
  MANIFEST_VERSION,
  type SyncManifest,
  type SyncDecision,
} from "./manifest";

// Database export/import
export {
  exportFullDatabase,
  importFullDatabase,
  previewImport,
  blobToBase64,
  base64ToBlob,
  estimateDatabaseSize,
  hasChangesSince,
  getMostRecentUpdateTime,
  type ExportProgress,
  type ImportProgress,
  type ExportResult,
  type ImportResult,
  type ImportPreview,
} from "./db-export";

// Encryption
export {
  encryptSyncData,
  decryptSyncData,
  encryptSyncString,
  decryptSyncString,
  isEncryptedSyncData,
  setSessionPassword,
  getSessionPassword,
  clearSessionPassword,
  validateSyncPassword,
  type EncryptedSyncData,
} from "./encryption";
