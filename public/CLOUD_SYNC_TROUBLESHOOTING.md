# Cloud Sync Troubleshooting Guide

## CORS Errors (Most Common Issue)

### What is CORS?

CORS (Cross-Origin Resource Sharing) is a security mechanism that prevents web browsers from making requests to different domains than the one serving the web page. Since Lumina runs in your browser and tries to access S3/R2 storage, CORS must be configured.

### Symptoms

- "CORS error" in browser console
- "Access to fetch... has been blocked by CORS policy"
- Connection test fails with CORS-related error
- Network tab shows failed requests to your bucket

---

## Quick Fix: Use the "Fix CORS" Button

1. **Go to Settings → Cloud Sync**
2. **Click "Fix CORS" button**
   - This automatically configures CORS on your bucket
   - Requires valid credentials with CORS configuration permissions

3. **Wait a few seconds** for changes to propagate
4. **Click "Test Connection"** again

---

## Manual CORS Configuration

If the automatic fix doesn't work, configure CORS manually:

### For Cloudflare R2

1. **Go to Cloudflare Dashboard**
   - Navigate to R2 → Your Bucket

2. **Click "Settings" tab**

3. **Scroll to "CORS Policy"**

4. **Add this CORS configuration:**

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://yourdomain.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

**Important:** Replace `https://yourdomain.com` with your actual domain!

5. **Save the configuration**

6. **Wait 30 seconds** for changes to propagate

7. **Try "Test Connection" again**

---

### For AWS S3

#### Option 1: AWS Console (Easy)

1. **Open AWS S3 Console**
   - Go to https://s3.console.aws.amazon.com/

2. **Select your bucket**

3. **Click "Permissions" tab**

4. **Scroll to "Cross-origin resource sharing (CORS)"**

5. **Click "Edit"**

6. **Paste this configuration:**

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://yourdomain.com"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

**Important:** Replace origins with your actual domain(s)!

7. **Click "Save changes"**

8. **Wait 30 seconds** and test again

#### Option 2: AWS CLI (Advanced)

```bash
# Create a file named cors.json
cat > cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

# Apply CORS configuration
aws s3api put-bucket-cors \
  --bucket your-bucket-name \
  --cors-configuration file://cors.json
```

---

## Common CORS Issues

### Issue 1: Wrong Origin

**Problem:** You added CORS but it still doesn't work

**Cause:** The origin in your CORS config doesn't match your actual domain

**Solution:**
1. Check what origin your browser is sending:
   - Open browser DevTools (F12)
   - Go to Network tab
   - Look at the failed request
   - Check the "Origin" header in request headers

2. Update CORS to include that exact origin:
   - Must match protocol (http vs https)
   - Must match port (e.g., :3000)
   - Must match domain exactly

**Examples:**
- `http://localhost:3000` ≠ `https://localhost:3000`
- `http://localhost:3000` ≠ `http://localhost:3001`
- `https://lumina.dev` ≠ `https://www.lumina.dev`

---

### Issue 2: Missing Methods

**Problem:** Some operations work, others fail

**Cause:** CORS not configured for all needed methods

**Solution:**
Ensure your CORS config includes:
- `GET` - for downloading data
- `PUT` - for uploading data
- `HEAD` - for checking if files exist

---

### Issue 3: Missing ExposeHeaders

**Problem:** Uploads work but validation fails

**Cause:** Browser can't read ETag header needed for integrity checks

**Solution:**
Add `"ExposeHeaders": ["ETag"]` to your CORS config

---

### Issue 4: Preflight Failures

**Problem:** Browser makes OPTIONS request that fails

**Cause:** CORS doesn't allow OPTIONS method or proper headers

**Solution:**
1. Make sure `AllowedHeaders` includes `*` or specific headers:
   - `Content-Type`
   - `Authorization`
   - `x-amz-*`

2. Browser automatically sends OPTIONS - you don't need to add it to AllowedMethods

---

### Issue 5: Propagation Delay

**Problem:** CORS configured correctly but still fails

**Cause:** Changes take time to propagate

**Solution:**
- **AWS S3:** Usually instant, max 30 seconds
- **Cloudflare R2:** Usually instant, max 1 minute
- Wait and try again
- Clear browser cache (Ctrl+Shift+R)
- Try in incognito mode

---

## Permission Issues

### Symptoms
- "Access Denied" errors
- "Forbidden" or 403 errors
- "Invalid Access Key ID"

### For Cloudflare R2

**Required Permissions:**
Your R2 API token needs:
- Read access
- Write access
- CORS configuration permissions (if using "Fix CORS")

**How to create proper token:**

1. Go to Cloudflare Dashboard → R2
2. Click "Manage R2 API Tokens"
3. Click "Create API Token"
4. Select permissions:
   - ✅ Object Read
   - ✅ Object Write
   - ✅ Bucket Configuration (for CORS)
5. Select specific bucket or all buckets
6. Create token and copy credentials

### For AWS S3

**Required IAM Permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:HeadObject",
        "s3:HeadBucket",
        "s3:PutBucketCors"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

**How to create IAM user:**

1. Go to AWS IAM Console
2. Click "Users" → "Add users"
3. Enter username
4. Select "Access key - Programmatic access"
5. Click "Attach policies directly"
6. Click "Create policy" and paste above JSON
7. Attach policy to user
8. Copy Access Key ID and Secret Access Key

---

## Connection Issues

### Symptom: "Bucket not found"

**Possible Causes:**
1. Bucket name is incorrect (typo)
2. Bucket doesn't exist yet
3. Bucket is in different region/account

**Solutions:**
- Double-check bucket name (case-sensitive)
- Create bucket if it doesn't exist
- Verify you're using correct account

---

### Symptom: "Invalid endpoint"

**For R2 Users:**
- Endpoint must be: `https://[ACCOUNT_ID].r2.cloudflarestorage.com`
- Get Account ID from Cloudflare Dashboard
- Do NOT use bucket name in endpoint

**For S3 Users:**
- Leave endpoint blank (uses AWS default)
- OR use region-specific: `https://s3.[region].amazonaws.com`

---

### Symptom: "Network error" or "Failed to fetch"

**Possible Causes:**
1. No internet connection
2. Firewall blocking requests
3. VPN/proxy issues
4. DNS issues

**Solutions:**
- Check internet connection
- Disable VPN temporarily
- Try different network
- Check browser console for detailed error

---

## Encryption Issues

### Symptom: "Decryption failed"

**Possible Causes:**
1. Wrong password
2. Data was uploaded without encryption
3. Data is corrupted

**Solutions:**
1. **Verify password:**
   - Password is case-sensitive
   - Check for extra spaces
   - Try typing instead of pasting

2. **Check if data was encrypted:**
   - Download data.json manually
   - Check if it starts with `{"version":1,"salt":...}`
   - If it doesn't, data wasn't encrypted

3. **Force re-upload:**
   - Click "Force Upload" to overwrite remote data
   - Ensure encryption is enabled

---

### Symptom: "Encryption password required"

**Cause:** You enabled encryption but haven't entered password

**Solution:**
1. Enter your encryption password in settings
2. Password is stored only for current session
3. Re-enter password after closing tab

---

## Sync Issues

### Symptom: Sync keeps failing

**Debug Steps:**

1. **Check browser console:**
   - Press F12
   - Go to Console tab
   - Look for error messages with `[CloudSync]` prefix

2. **Check Network tab:**
   - See which request is failing
   - Check response status code
   - Read error message in response

3. **Test connection:**
   - Use "Test Connection" button
   - If it passes, issue is with sync logic
   - If it fails, check credentials/CORS

4. **Try force operations:**
   - "Force Upload" - uploads regardless of remote state
   - "Force Download" - downloads regardless of local state
   - Helps identify if issue is with conflict resolution

---

### Symptom: Data not syncing between devices

**Possible Causes:**
1. Auto-sync disabled
2. Same device ID on both devices
3. Sync interval too long

**Solutions:**
1. **Enable auto-sync** on both devices
2. **Check device IDs:**
   - Each device should have unique ID
   - Clear browser data resets device ID
3. **Lower sync interval** (minimum 30s recommended)

---

## Performance Issues

### Symptom: Sync is very slow

**Causes:**
- Large database size
- Slow internet connection
- Encryption overhead

**Solutions:**
1. **Check database size:**
   - Go to Settings → Data Management
   - See database size
   - Consider cleanup if >10MB

2. **Increase sync interval:**
   - Reduce sync frequency
   - Sync on-demand instead

3. **Compression (future):**
   - Not yet implemented
   - Will reduce upload size significantly

---

## Browser-Specific Issues

### Chrome/Edge
- Usually works best
- Good DevTools for debugging
- Clear cache: Ctrl+Shift+Delete

### Firefox
- May have stricter CORS policies
- Check "about:config" for CORS settings
- Try disabling Enhanced Tracking Protection

### Safari
- May block cross-origin requests
- Check "Prevent cross-site tracking" setting
- Try disabling Intelligent Tracking Prevention

---

## Testing Your Configuration

### Step-by-Step Test

1. **Test Connection**
   ```
   Settings → Cloud Sync → Test Connection
   ```
   - ✅ Success = credentials and CORS work
   - ❌ Fail = check credentials or CORS

2. **Test Upload**
   ```
   Settings → Cloud Sync → Force Upload
   ```
   - ✅ Success = write permissions work
   - ❌ Fail = check IAM/token permissions

3. **Test Download**
   ```
   Settings → Cloud Sync → Force Download
   ```
   - ✅ Success = read permissions work
   - ❌ Fail = check bucket policy

4. **Test Auto-Sync**
   - Enable auto-sync
   - Make a change (create chat message)
   - Wait 5 seconds (debounce)
   - Check sync status indicator
   - ✅ Should upload automatically

---

## Getting Help

### Collect Debug Information

Before asking for help, collect:

1. **Browser Console Errors:**
   - F12 → Console
   - Copy error messages

2. **Network Errors:**
   - F12 → Network
   - Filter by "s3" or bucket name
   - Screenshot failed requests

3. **Configuration:**
   - Provider (S3 or R2)
   - Region/Account ID
   - Bucket name
   - Encryption enabled?

4. **CORS Configuration:**
   - Copy your current CORS JSON

### Where to Get Help

- **GitHub Issues:** https://github.com/anthropics/claude-code/issues
- **Documentation:** `CLOUD_SYNC_IMPLEMENTATION.md`
- **Security:** `SECURITY_AUDIT_CLOUD_SYNC.md`

---

## Preventive Measures

### Best Practices

1. **Use separate bucket for Lumina**
   - Don't mix with other data
   - Easier to manage CORS and permissions

2. **Test in development first**
   - Use test bucket before production
   - Verify configuration works

3. **Enable encryption**
   - Protects sensitive data
   - Use strong password (12+ characters)

4. **Monitor costs**
   - Cloudflare R2: Free for first 10GB
   - AWS S3: ~$0.023/GB/month
   - Typical usage: <5MB = ~$0.10/month

5. **Backup important data**
   - Cloud sync is not a backup solution
   - Export important chats separately
   - Use local backups as well

---

## Advanced Debugging

### Check CORS with curl

```bash
# Test if CORS is configured
curl -X OPTIONS \
  -H "Origin: https://yourdomain.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -i \
  https://your-bucket.s3.region.amazonaws.com/
```

Look for:
- `Access-Control-Allow-Origin` header in response
- Should match your origin

### Manual Upload Test

```bash
# Test credentials work outside browser
aws s3 cp test.txt s3://your-bucket/test.txt

# Or for R2
aws s3 cp test.txt s3://your-bucket/test.txt \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
```

### Check Bucket Policy

```bash
# Get bucket CORS configuration
aws s3api get-bucket-cors --bucket your-bucket-name

# Get bucket policy
aws s3api get-bucket-policy --bucket your-bucket-name
```

---

## Common Error Messages Explained

| Error Message | Meaning | Solution |
|--------------|---------|----------|
| `CORS policy` | CORS not configured | Click "Fix CORS" or configure manually |
| `Access Denied` | Wrong credentials or permissions | Check IAM policy or R2 token |
| `Bucket not found` | Bucket doesn't exist or wrong name | Verify bucket name |
| `Invalid Access Key ID` | Wrong access key | Re-enter credentials |
| `SignatureDoesNotMatch` | Wrong secret key | Re-enter credentials |
| `Decryption failed` | Wrong password | Check password |
| `Network error` | Internet or DNS issue | Check connection |
| `Checksum mismatch` | Data corrupted | Try re-uploading |

---

**Last Updated:** 2026-01-24
**Version:** 1.0.0

For more information, see [CLOUD_SYNC_IMPLEMENTATION.md](./CLOUD_SYNC_IMPLEMENTATION.md)
