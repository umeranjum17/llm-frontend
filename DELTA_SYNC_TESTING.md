# Delta Sync Testing Guide

## Prerequisites

### S3-Compatible Storage
You'll need access to S3-compatible storage. Here are some options:

#### Option 1: Cloudflare R2 (Recommended - Free Tier)
1. Sign up at https://cloudflare.com
2. Navigate to R2 Object Storage
3. Create a bucket (e.g., `lumina-sync`)
4. Create API token:
   - R2 Dashboard → Manage R2 API Tokens
   - Click "Create API Token"
   - Copy Access Key ID and Secret Access Key
5. Note your account ID from the R2 dashboard URL

**Configuration:**
- Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
- Bucket: `lumina-sync`
- Region: `auto`
- Access Key ID: (from token)
- Secret Access Key: (from token)

#### Option 2: AWS S3
1. Sign up at https://aws.amazon.com
2. Create an S3 bucket
3. Create IAM user with S3 access
4. Generate access keys

**Configuration:**
- Endpoint: `https://s3.amazonaws.com`
- Bucket: `your-bucket-name`
- Region: `us-east-1` (or your region)
- Access Key ID: (from IAM)
- Secret Access Key: (from IAM)

#### Option 3: MinIO (Self-Hosted)
1. Install MinIO: https://min.io/download
2. Run locally: `minio server /data`
3. Create bucket via web UI (default: http://localhost:9000)

**Configuration:**
- Endpoint: `http://localhost:9000`
- Bucket: `lumina-sync`
- Region: `us-east-1`
- Access Key ID: `minioadmin` (default)
- Secret Access Key: `minioadmin` (default)

---

## Testing Steps

### 1. Initial Setup (Device A)

1. **Start the app**
   ```bash
   npm run dev
   ```

2. **Navigate to Settings**
   - Go to http://localhost:3000/settings
   - Click on the "Sync" tab (Cloud icon)

3. **Configure S3**
   - Click "Configure" button
   - Enter your S3 credentials
   - Click "Save Configuration"
   - You should see status change to "Configured" with a green checkmark

4. **Verify Device ID**
   - Note the Device ID shown (e.g., `device-1234567890abc-xyz123`)
   - Click the copy icon to copy it

5. **Create Some Data**
   - Go back to the main chat
   - Create a few chats
   - Add some messages
   - Add an API key in settings

6. **Check Pending Changes**
   - Go back to Sync tab
   - You should see "Pending Changes: X" where X > 0

7. **Perform First Sync**
   - Click "Sync Now" button
   - Watch the sync progress messages
   - Should see: "Sync complete: X uploaded, 0 downloaded, 0 applied"
   - Pending Changes should now be 0

8. **Verify S3 Upload**
   - Check your S3 bucket
   - You should see:
     ```
     /manifest.json
     /changes/device-XXXXX/1234567890.json
     ```

---

### 2. Second Device Setup (Device B)

1. **Open in another browser/incognito/device**
   - Use a different browser profile or incognito mode
   - Or use an actual different device

2. **Configure S3 with SAME credentials**
   - Navigate to Settings → Sync
   - Configure with the same S3 endpoint, bucket, and credentials
   - Save configuration

3. **Note Different Device ID**
   - Device B will have a different device ID
   - This is expected and correct

4. **First Sync on Device B**
   - Click "Sync Now"
   - Should see: "Sync complete: 0 uploaded, X downloaded, X applied"
   - Where X is the number of changes from Device A

5. **Verify Data Appeared**
   - Go back to main chat
   - You should see all the chats from Device A
   - API keys should be synced
   - Messages should be present

---

### 3. Bi-Directional Sync Test

1. **On Device A:**
   - Create a new chat called "Test from A"
   - Add a message
   - Go to Sync tab and click "Sync Now"
   - Should upload 2-3 changes (chat creation, message, etc.)

2. **On Device B:**
   - Create a new chat called "Test from B"
   - Add a message
   - Go to Sync tab and click "Sync Now"
   - Should upload AND download
   - Should see both "Test from A" and "Test from B" chats

3. **On Device A:**
   - Click "Sync Now" again
   - Should download "Test from B"
   - Verify "Test from B" now appears

---

### 4. Conflict Resolution Test

1. **On Device A:**
   - Edit a chat title to "Version A"
   - **DO NOT SYNC YET**

2. **On Device B:**
   - Edit the SAME chat title to "Version B"
   - **DO NOT SYNC YET**

3. **Sync Device A first:**
   - Click "Sync Now"
   - "Version A" is now in S3

4. **Sync Device B:**
   - Click "Sync Now"
   - Should see conflict: last-write-wins
   - The title should be "Version B" (later timestamp wins)

5. **Sync Device A again:**
   - Click "Sync Now"
   - Title should change to "Version B"

---

### 5. Offline/Delayed Sync Test

1. **On Device A:**
   - Close browser or disable network
   - Keep Device A offline for a while

2. **On Device B:**
   - Make several changes (create chats, edit messages, etc.)
   - Sync each time
   - All changes upload to S3

3. **Bring Device A online:**
   - Open app on Device A
   - Go to Sync tab
   - Click "Sync Now"
   - Should download all changes made while offline
   - Verify all changes appear correctly

---

## Expected Behavior

### ✅ Success Criteria

- [x] Device ID is unique per browser/device
- [x] S3 configuration persists across sessions
- [x] Changes are tracked automatically (no manual intervention)
- [x] Sync uploads local changes to S3
- [x] Sync downloads changes from other devices
- [x] Conflicts are resolved (last-write-wins)
- [x] Sync status shows correct counts
- [x] Progress messages appear during sync
- [x] No duplicate data after multiple syncs
- [x] Works offline (queues changes for later sync)

### ⚠️ Known Limitations

- **No encryption**: Change logs are stored in plain text on S3
- **No compression**: Change logs are not compressed
- **No cleanup**: Old change files accumulate (manual cleanup needed)
- **No real-time**: Sync is manual only (no auto-sync yet)
- **No conflict UI**: Conflicts resolved automatically, no user review

---

## Debugging

### Check Browser Console
```javascript
// Check device ID
localStorage.getItem('lumina-device-id')

// Check pending changes
await db._pendingChanges.count()

// View pending changes
await db._pendingChanges.toArray()

// Check sync metadata
await db._syncMeta.get('default')
```

### Check S3 Bucket
- List files in `/changes/` directory
- Download a change file to inspect JSON structure
- Check `manifest.json` for device sync status

### Common Issues

**"S3 not configured" error:**
- Verify all fields are filled
- Check endpoint URL format
- Ensure credentials are correct

**"Failed to upload to S3" error:**
- Check S3 bucket permissions
- Verify CORS settings (for browser access)
- Check network/firewall

**Changes not syncing:**
- Verify Pending Changes count > 0
- Check browser console for errors
- Verify change tracking initialized (`[Sync] Change tracking initialized`)

**Duplicate data:**
- This shouldn't happen with proper ID management
- If it does, report as a bug

---

## Performance Testing

### Measure Efficiency

1. **Small changes (typical use case):**
   - Add 5 messages
   - Sync
   - Check change file size in S3
   - Should be ~2-3KB

2. **Large changes:**
   - Create 50 chats
   - Add 100 messages
   - Sync
   - Check change file size
   - Should be ~50-100KB

3. **Compare to full export:**
   - Export entire database via Data tab
   - Compare file sizes
   - Delta sync should be 90-99% smaller for incremental changes

---

## S3 CORS Configuration (If Needed)

If you get CORS errors when accessing S3 from the browser, add this CORS policy to your bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

For AWS S3:
- Bucket → Permissions → CORS configuration

For Cloudflare R2:
- Bucket → Settings → CORS Policy

---

## Next Steps After Testing

Once basic sync works:

1. **Enable auto-sync** (optional enhancement)
2. **Add encryption** for change logs
3. **Implement cleanup** of old change files
4. **Add conflict review UI** (optional)
5. **Monitor sync metrics** (success rate, data transferred, etc.)

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Review S3 bucket contents
3. Verify configuration settings
4. Check network requests in DevTools

Report bugs with:
- Browser and version
- S3 provider being used
- Error messages from console
- Steps to reproduce
