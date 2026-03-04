# Firestore Rules Deployment Guide

## Quick Start

These Firestore rules have been created and configured. To deploy them:

### Option 1: Using Firebase CLI (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Deploy the rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

### Option 2: Manual Update via Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `nutritrack-ai-94a87`
3. Navigate to **Firestore Database** → **Rules** tab
4. Replace the entire contents with the rules from `firestore.rules` file
5. Click **Publish**

## What These Rules Do

The rules in `firestore.rules` allow:

- ✅ **Read**: Users can read their own data (`/users/{uid}/**`)
- ✅ **Write**: Users can write to their own data (updates, creates)
- ✅ **Delete**: Users can delete entries in their own data
- ✅ **Security**: Only authenticated users can access their own data

## Rule Breakdown

```
match /users/{uid}/{document=**} {
  allow read, write, delete: if request.auth.uid == uid;
}
```

This means:
- Only the document owner (uid) can read, write, or delete
- All operations require authentication
- Prevents access to other users' data

## Files Modified

- `firestore.rules` - New Firestore security rules
- `firebase.json` - Updated to reference firestore rules

## Testing Delete Feature

After deploying the rules:

1. Refresh your app in the browser
2. Go to **History** page
3. Select any date with meals
4. Click the delete (🗑️) icon on any entry
5. Confirm deletion - it should now work!

## Troubleshooting

If delete still fails after deploying:

1. **Check browser console** (F12 → Console tab):
   - Look for detailed error messages
   - Check network errors in Network tab

2. **Verify rules deployed**:
   ```bash
   firebase rules:list
   ```

3. **Check Firestore console** for the deployed rules

## Additional Notes

- Rules are deployed instantly - no app restart needed
- Browser cache may need refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Check app logs for "permission-denied" or similar errors
