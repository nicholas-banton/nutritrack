# NutriTrack - Field Testing Deployment Guide

## 📱 Deployment Method: Firebase Hosting + PWA

Your app is now configured as a **Progressive Web App (PWA)** that works on mobile and desktop!

### **Step 1: Deploy to Firebase Hosting**

```bash
cd /Users/nicholasbanton/nutritrack
firebase deploy --only hosting
```

This will:
- Build your app
- Deploy to Firebase Hosting
- Provide a public URL (usually `https://nutritrack-8f1ea.web.app`)

### **Step 2: Share with Field Testers**

Once deployed, share this URL with your testers:
```
https://nutritrack-8f1ea.web.app
```

### **Step 3: Install on Devices**

#### **📱 Mobile (iOS/Android)**
1. Open the URL in Safari (iOS) or Chrome (Android)
2. Tap the **Share** button (iOS) or **Menu** (Android)
3. Select **Add to Home Screen** / **Install App**
4. App will install like a native app with offline capability

#### **🖥️ Desktop (Mac/Windows/Linux)**
1. Open the URL in Chrome, Edge, or Firefox
2. Click the **Install** icon in the address bar
3. App installs as a desktop application
4. Can work offline with cached data

### **PWA Features Enabled**
✅ Works offline (service worker caching)
✅ Installable on mobile & desktop
✅ Full app experience (no browser UI)
✅ Push notifications ready
✅ Background sync capable

### **What to Test**
- [ ] Login with Google OAuth
- [ ] Add meals across different profiles
- [ ] Switch between profiles
- [ ] Save personal settings
- [ ] View history with profile filtering
- [ ] Dashboard calorie tracking
- [ ] Offline functionality (flight mode)
- [ ] App installation on various devices

### **Feedback Collection**
Ask testers to note:
- Device/OS used
- Any crashes or errors
- UI/UX issues
- Performance problems
- Missing features

### **To Update Deployment**
After making code changes:
```bash
npm run build
firebase deploy --only hosting
```

---

## **Alternative: Local Testing with ngrok**

If you want to test locally with others:
```bash
npm run dev
# In another terminal
ngrok http 3002
# Share the ngrok URL
```

---

## **Icon Files**
⚠️ Replace placeholder icons in `public/`:
- `icon-192x192.png` (192x192 pixels)
- `icon-512x512.png` (512x512 pixels)

Use your brand logo for professional app appearance.
