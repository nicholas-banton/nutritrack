'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, updateProfile,
  AuthError,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { calculateMacroGoals } from '@/lib/types/user-profile';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Check for redirect result (handles Google redirect flow)
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          setUser(result.user);
        }
      } catch (err: any) {
        console.error('Redirect result error:', err);
      }
    };
    handleRedirectResult();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setAuthError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      const errorMsg = getAuthErrorMessage(err);
      setAuthError(errorMsg);
      throw err;
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      setAuthError(null);
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) await updateProfile(user, { displayName });
      
      // Create initial profile document for new users
      try {
        const defaultProfile = {
          name: displayName || 'New User',
          age: 25,
          sex: 'other',
          heightInches: 70,
          currentWeightLbs: 150,
          goalWeightLbs: 150,
          profileId: 'main',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        // Calculate default macro goals
        const macroGoals = calculateMacroGoals(
          defaultProfile.age,
          defaultProfile.sex,
          defaultProfile.heightInches,
          defaultProfile.currentWeightLbs,
          defaultProfile.goalWeightLbs
        );
        
        const profileWithGoals = {
          ...defaultProfile,
          ...macroGoals,
        };
        
        await setDoc(doc(db, 'users', user.uid, 'profile', 'settings'), profileWithGoals);
        console.log('[AUTH] Profile created for new user:', user.uid);
      } catch (profileError: any) {
        // Log profile creation error but don't fail signup
        console.error('[AUTH] Failed to create profile document:', profileError.message);
      }
    } catch (err: any) {
      const errorMsg = getAuthErrorMessage(err);
      setAuthError(errorMsg);
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setAuthError(null);
      // Try popup first
      const result = await signInWithPopup(auth, provider);
      
      // Create profile if doesn't exist (for new Google signup users)
      try {
        const defaultProfile = {
          name: result.user.displayName || 'New User',
          age: 25,
          sex: 'other',
          heightInches: 70,
          currentWeightLbs: 150,
          goalWeightLbs: 150,
          profileId: 'main',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        
        // Calculate default macro goals
        const macroGoals = calculateMacroGoals(
          defaultProfile.age,
          defaultProfile.sex,
          defaultProfile.heightInches,
          defaultProfile.currentWeightLbs,
          defaultProfile.goalWeightLbs
        );
        
        const profileWithGoals = {
          ...defaultProfile,
          ...macroGoals,
        };
        
        // Use merge: true so we don't overwrite existing profiles
        await setDoc(doc(db, 'users', result.user.uid, 'profile', 'settings'), profileWithGoals, { merge: true });
        console.log('[AUTH] Profile created/verified for Google user:', result.user.uid);
      } catch (profileError: any) {
        console.error('[AUTH] Failed to create profile for Google user:', profileError.message);
      }
    } catch (err: any) {
      // If popup is blocked, fall back to redirect
      if (err.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr: any) {
          const errorMsg = getAuthErrorMessage(redirectErr);
          setAuthError(errorMsg);
          throw redirectErr;
        }
      } else {
        const errorMsg = getAuthErrorMessage(err);
        setAuthError(errorMsg);
        throw err;
      }
    }
  };

  const logOut = async () => {
    try {
      setAuthError(null);
      await signOut(auth);
    } catch (err: any) {
      const errorMsg = getAuthErrorMessage(err);
      setAuthError(errorMsg);
      throw err;
    }
  };

  const clearError = () => setAuthError(null);

  return (
    <AuthContext.Provider value={{ user, loading, authError, clearError, signIn, signUp, signInWithGoogle, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function getAuthErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'auth/popup-blocked':
      return 'Popup was blocked. Attempting alternative login method...';
    case 'auth/user-not-found':
      return 'Email not found. Please sign up first.';
    case 'auth/wrong-password':
      return 'Invalid password. Please try again.';
    case 'auth/email-already-in-use':
      return 'Email already in use. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/too-many-requests':
      return 'Too many login attempts. Please try again later.';
    default:
      return error.message || 'Authentication error. Please try again.';
  }
}
