# Firebase Storage CORS Configuration Guide

## Overview

This document explains how to configure CORS (Cross-Origin Resource Sharing) for Firebase Storage to enable image uploads from your Vercel-deployed app.

## The Problem

When uploading images from a web browser to Firebase Storage, browsers enforce CORS policies. Without proper CORS configuration, you'll see errors like:

```
Access to XMLHttpRequest blocked by CORS policy:
Response to preflight request doesn't pass access control check
```

## The Solution

Firebase Storage can be configured with CORS rules that allow requests from specific origins (domains).

### Configuration

The CORS configuration is stored in `cors.json`:

```json
[
  {
    "origin": [
      "https://nutritrack-ai-one.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
      "https://localhost:3000"
    ],
    "method": ["GET", "HEAD", "DELETE", "POST", "PUT", "OPTIONS", "PATCH"],
    "responseHeader": ["*"],
    "maxAgeSeconds": 3600
  }
]
```

### What This Means

- **origin**: Domains allowed to upload images
  - `https://nutritrack-ai-one.vercel.app` - Your production Vercel app
  - `http://localhost:3000` - Local development
  - `https://localhost:3000` - Local HTTPS testing
  - `http://localhost:3001` - Alternative local port

- **method**: HTTP methods allowed (POST for uploads, GET for downloads, etc.)
- **responseHeader**: `*` allows all response headers (necessary for proper CORS)
- **maxAgeSeconds**: How long the browser caches CORS preflight results (1 hour)

## How to Apply CORS

### Prerequisites

You need Google Cloud SDK installed:

```bash
# Install Google Cloud SDK
# macOS with Homebrew:
brew install google-cloud-sdk

# Or visit: https://cloud.google.com/sdk/docs/install
```

### Step 1: Authenticate with Google Cloud

```bash
gcloud auth login
```

This opens your browser to sign in with your Google account (the one that owns the Firebase project).

### Step 2: Run the Setup Script

```bash
./setup-cors.sh
```

This script:
1. Checks if `gsutil` is installed
2. Authenticates with Google Cloud
3. Applies the CORS configuration from `cors.json`
4. Verifies the configuration was applied

### Step 3: Verify the Configuration

To manually verify:

```bash
gsutil cors get gs://nutritrack-ai-94a87.appspot.com
```

You should see output like:

```json
[
  {
    "maxAgeSeconds": 3600,
    "method": ["GET", "HEAD", "DELETE", "POST", "PUT", "OPTIONS", "PATCH"],
    "origin": [
      "https://nutritrack-ai-one.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
      "https://localhost:3000"
    ],
    "responseHeader": ["*"]
  }
]
```

## Troubleshooting

### "gsutil is not installed"

Install Google Cloud SDK:
```bash
brew install google-cloud-sdk  # macOS
# or visit https://cloud.google.com/sdk/docs/install
```

### "Not authenticated"

You need to log in:
```bash
gcloud auth login
# Follow the browser prompt to sign in
```

Make sure you use the Google account that owns the Firebase project.

### "Failed to apply CORS configuration"

Check:
1. **Permissions**: You need Editor or Storage Admin role on the project
2. **Project ID**: Verify the bucket name is correct
3. **Authentication**: Run `gcloud auth login` again
4. **Firebase Console**: Check https://console.firebase.google.com/u/0/project/nutritrack-ai-94a87/storage/browser

### CORS Errors Still Occurring

After applying the configuration:
1. **Clear browser cache** (especially for localhost development)
2. **Hard refresh** in browser (Cmd+Shift+R on Mac)
3. **Check console logs** for detailed error messages
4. **Verify upload code** has proper error handling

## How Image Uploads Work

With CORS configured, image uploads follow this flow:

1. **Browser captures** photo or selects file
2. **Image is processed** to compatible format (JPEG, compressed)
3. **User reviews** in preview and clicks "Save Entry"
4. **Image is converted** from data URI to Blob
5. **Firebase SDK uploads** Blob to Storage (CORS preflight succeeds)
6. **Download URL** is retrieved
7. **Entry saved** to Firestore with image URL
8. **Success screen** shown to user

## Code Implementation

The image upload code in `src/app/(app)/log/page.tsx`:

```typescript
// Convert data URI to Blob (handles CORS-friendly format)
const blob = dataURItoBlob(processedImageDataUri);

// Upload to Storage
const uploadResult = await uploadBytes(storageRef, blob);
imageUrl = await getDownloadURL(uploadResult.ref);

// Continue saving entry even if upload fails (non-blocking)
```

With CORS configured, the `uploadBytes()` call will succeed because the CORS preflight request will pass.

## Monitoring & Logs

### Firebase Console

Monitor uploads in Firebase Console:
1. Go to https://console.firebase.google.com/
2. Select project `nutritrack-ai-94a87`
3. Navigate to **Storage**
4. View uploaded files under `food-images/`

### Browser Console

Look for these log patterns:

```
✅ [LOG_PAGE_SAVE] Image uploaded successfully: https://firebasestorage.googleapis.com/...
```

Or if upload fails:

```
⚠️ [LOG_PAGE_SAVE] Image upload failed: [error details]
[LOG_PAGE_SAVE] Continuing without image attachment...
```

## Security Notes

1. **Response Headers**: Set to `*` allows all headers (safe for this use case)
2. **Origins**: Limited to Vercel and localhost (not exposed to other domains)
3. **Methods**: Limited to necessary operations (no DELETE for users)
4. **Max Age**: 1 hour is standard (browsers cache preflight results)

## Adding New Origins

To add more origins (future subdomains, other environments):

1. Edit `cors.json`:
   ```json
   "origin": [
     "https://nutritrack-ai-one.vercel.app",
     "https://new-domain.vercel.app",  // Add here
     "http://localhost:3000"
   ]
   ```

2. Run the setup script again:
   ```bash
   ./setup-cors.sh
   ```

## References

- [Firebase Storage CORS Guide](https://firebase.google.com/docs/storage/web/download-files#cors_configuration)
- [Google Cloud CORS Documentation](https://cloud.google.com/storage/docs/cross-origin)
- [MDN CORS Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
