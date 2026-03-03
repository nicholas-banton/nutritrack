/**
 * Dynamic Firebase Configuration
 * This file is generated from environment variables and loaded by calorie-tracker.html
 * Keeps sensitive config out of static HTML while keeping it accessible to the browser
 */

window.NutritrackConfig = {
  firebase: {
    apiKey:            window.ENV?.FIREBASE_API_KEY || "AIzaSyDsA3gB7QcHOs4NAXQ5JyXJzXnJ1IQpFSA",
    authDomain:        window.ENV?.FIREBASE_AUTH_DOMAIN || "nutritrack-ai-94a87.firebaseapp.com",
    projectId:         window.ENV?.FIREBASE_PROJECT_ID || "nutritrack-ai-94a87",
    storageBucket:     window.ENV?.FIREBASE_STORAGE_BUCKET || "nutritrack-ai-94a87.firebasestorage.app",
    messagingSenderId: window.ENV?.FIREBASE_MESSAGING_SENDER_ID || "648917299813",
    appId:             window.ENV?.FIREBASE_APP_ID || "1:648917299813:web:edd7adc65592f8e9e88c8c"
  },
  usdaApiKey: window.ENV?.USDA_API_KEY || "DEMO_KEY"
};

console.log("✓ NutritrackConfig loaded");
