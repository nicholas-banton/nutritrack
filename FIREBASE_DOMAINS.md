# Firebase Authorized Domains Checklist
# Add these domains to Firebase Console → Authentication → Settings → Authorized domains

## Production Domains (ADD ALL OF THESE):
✅ nutritrack-pajlmpp6q-nicholasbanton-4896s-projects.vercel.app
✅ nutritrack-ai-one.vercel.app

## Development Domains:
✅ localhost:3000
✅ localhost:3001
✅ 127.0.0.1:3000

## Steps to Add:
1. Go to: https://console.firebase.google.com
2. Select Project: nutritrack-ai-94a87
3. Navigate to: Authentication → Settings (gear icon)
4. Scroll to: "Authorized domains"
5. Click: "Add domain"
6. Paste each domain above
7. Click: "Add"
8. Wait 5-10 minutes for propagation

## If you still get the error after adding domains:
- Clear browser cache (Ctrl+Shift+Del or Cmd+Shift+Del)
- Try in incognito/private window
- Check that authDomain in config matches: nutritrack-ai-94a87.firebaseapp.com
- Verify you're using the correct Firebase project

## Need to update domains in the future?
1. When you get a new Vercel URL, add it immediately
2. Run: ./deploy.sh
3. Add new URL to Firebase
