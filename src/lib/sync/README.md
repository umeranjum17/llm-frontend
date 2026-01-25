# Delta Sync

Efficient device-to-device synchronization that only transfers changes (deltas), not the entire database.

## Overview

Delta Sync uses Dexie CRUD hooks to track local changes and syncs them to S3-compatible storage. Other devices download and apply these changes with conflict resolution.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Device A      │     │    Device B     │
│  ┌───────────┐  │     │  ┌───────────┐  │
│  │ LuminaDB  │  │     │  │ LuminaDB  │  │
│  └─────┬─────┘  │     │  └─────┬─────┘  │
│        │        │     │        │        │
│  ┌─────▼─────┐  │     │  ┌─────▼─────┐  │
│  │ Change    │  │     │  │ Change    │  │
│  │ Tracker   │  │     │  │ Tracker   │  │
│  └─────┬─────┘  │     │  └─────┬─────┘  │
└────────┼────────┘     └────────┼────────┘
         │                       │
         ▼                       ▼
    ┌────────────────────────────────┐
    │         S3 Bucket              │
    │  /changes/deviceA/123.json     │
    │  /changes/deviceB/456.json     │
    │  /manifest.json (last sync)    │
    └────────────────────────────────┘
```

## How It Works

1. **Track Changes**: Dexie hooks capture all CRUD operations
2. **Queue Locally**: Changes stored in `_pendingChanges` table
3. **Upload**: Sync uploads change log to S3
4. **Download**: Fetch changes from other devices
5. **Apply**: Merge remote changes with conflict resolution (last-write-wins)
6. **Clear**: Remove pending changes after successful sync

## Files

- `device-id.ts` - Device ID generation and S3 config management
- `change-tracker.ts` - Dexie CRUD hooks to log changes
- `s3-adapter.ts` - S3 upload/download operations
- `apply-change.ts` - Apply remote changes with conflict resolution
- `sync-manager.ts` - Orchestrates the sync process
- `index.ts` - Public API exports

## Usage

### Initialize Change Tracking

```typescript
import { initializeChangeTracking } from "@/lib/sync";

// Call once on app startup
initializeChangeTracking();
```

### Configure S3

```typescript
import { setS3Config } from "@/lib/sync";

await setS3Config({
  endpoint: "https://s3.amazonaws.com",
  accessKeyId: "YOUR_ACCESS_KEY",
  secretAccessKey: "YOUR_SECRET_KEY",
  bucket: "my-lumina-sync",
  region: "us-east-1",
});
```

### Sync

```typescript
import { sync } from "@/lib/sync";

const result = await sync((progress) => {
  console.log(progress.message);
});

console.log(`Synced: ${result.uploaded} up, ${result.downloaded} down`);
```

## S3 Storage Structure

```
bucket/
├── manifest.json           # Device metadata
├── changes/
│   ├── device-abc/
│   │   ├── 1705000000.json  # Changes from device-abc at timestamp
│   │   ├── 1705001000.json
│   │   └── ...
│   └── device-xyz/
│       ├── 1705000500.json
│       └── ...
```

## Conflict Resolution

- **Last-Write-Wins**: Based on `timestamp` field
- Changes are applied in chronological order
- If a local record was modified after a remote delete, the local version is preserved

## Supported Storage

Any S3-compatible storage:
- AWS S3
- Cloudflare R2
- DigitalOcean Spaces
- MinIO
- Backblaze B2

## Security

- S3 credentials stored in `_syncMeta` table
- Consider encrypting credentials in production
- Use bucket policies to restrict access

## Limitations

- Currently no encryption for change logs
- No compression (could be added)
- No cleanup of old change files (manual or scheduled cleanup required)
- No real-time sync (manual or periodic)
