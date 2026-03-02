import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDsA3gB7QcHOs4NAXQ5JyXJzXnJ1IQpFSA",
  authDomain: "nutritrack-ai-94a87.firebaseapp.com",
  projectId: "nutritrack-ai-94a87",
  storageBucket: "nutritrack-ai-94a87.firebasestorage.app",
  messagingSenderId: "648917299813",
  appId: "1:648917299813:web:edd7adc65592f8e9e88c8c"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
