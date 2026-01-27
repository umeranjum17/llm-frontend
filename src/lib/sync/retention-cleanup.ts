import type { SyncManifest } from "@/lib/db/schema";
import { S3Adapter } from "@/lib/sync/s3-adapter";

const DEFAULT_RETENTION_DAYS = 30;

function parseTimestampFromKey(key: string): number | null {
  const match = key.match(/\/(\d+)\.json$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

export async function runRetentionCleanup(
  s3: S3Adapter,
  manifest: SyncManifest,
  retentionDays: number = DEFAULT_RETENTION_DAYS
) {
  const deviceTimes = Object.values(manifest.devices || {}).map((device) => device.lastSyncAt || 0);
  if (deviceTimes.length === 0) return;

  const minDeviceSync = Math.min(...deviceTimes);
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Math.min(minDeviceSync, Date.now() - retentionMs);
  if (cutoff <= 0) return;

  const files = await s3.listChangeFiles();
  const deletions = files
    .map((file) => ({ key: file.key, timestamp: parseTimestampFromKey(file.key) }))
    .filter((file) => file.timestamp && file.timestamp < cutoff);

  for (const file of deletions) {
    await s3.deleteObject(file.key);
  }
}
