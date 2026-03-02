'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, updateProfile,
  AuthError,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
      await signInWithPopup(auth, provider);
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
