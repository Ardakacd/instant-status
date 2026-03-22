import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { User } from "../types";
import { authService } from "../services/auth.service";
import Sentry from "../../sentry";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../config/firebase";
import { setOnSessionDead } from "../config/api";
import Purchases from "react-native-purchases";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  onboarding: boolean;
  emailVerified: boolean;
  authError: string | null;
  noInternet: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkEmailVerification: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true); // Default to true for Google and Apple users
  const [authError, setAuthError] = useState<string | null>(null);
  const [noInternet, setNoInternet] = useState(false);
  const refreshUserRef = useRef<() => Promise<void>>(() => Promise.resolve());

  /**
   * Atomic sync: one API call returns user, onboarding, emailVerified.
   * Replaces the old verify + getMe + checkEmailVerification triple-call race.
   */
  async function refreshUser() {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;

    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await authService.syncWithBackend(idToken);

      setUser(result.user);
      setOnboarding(result.onboarding);
      setEmailVerified(result.emailVerified);
      setAuthError(
        result.emailVerified ? null : "Please verify your email address to continue."
      );
      setNoInternet(false);

      Sentry.setUser({ id: result.user.firebase_uid });
      await AsyncStorage.setItem("firebase_uid", result.user.firebase_uid);
    } catch (error: any) {
      if (error?.isSessionDead) {
        setNoInternet(false);
        await authService.logout();
        return;
      }

      if (error?.isNetworkError) {
        setNoInternet(true);
        setAuthError(null);
        return;
      }

      Sentry.captureException(error);
      setNoInternet(false);
      await authService.logout();
    }
  }

  refreshUserRef.current = refreshUser;

  /** Re-sync to get fresh emailVerified; same as refreshUser. */
  async function checkEmailVerification() {
    await refreshUserRef.current();
  }

  // Register session-dead handler: interceptor broadcasts instead of calling authService (breaks circular dep)
  useEffect(() => {
    setOnSessionDead(() => authService.logout());
    return () => setOnSessionDead(null);
  }, []);

  // Single source of truth: Firebase Auth. onAuthStateChanged runs ONE sync call.
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setOnboarding(false);
        setEmailVerified(true);
        setAuthError(null);
        setNoInternet(false);
        setLoading(false);
      } else {
        try {
          // 1. RevenueCat: ensure logged in with Firebase UID (fast, local check usually)
          try {
            const customerInfo = await Purchases.getCustomerInfo();
            if (customerInfo.originalAppUserId !== firebaseUser.uid) {
              await Purchases.logIn(firebaseUser.uid);
            }
          } catch (rcError: any) {
            Sentry.captureException(rcError);
          }

          // 2. Await atomic sync before hiding splash - avoid empty state / Login redirect
          await refreshUserRef.current();
        } finally {
          // 3. ONLY now is the engine ready
          setLoading(false);
        }
      }
    });

    return unsubscribe;
  }, []);

  async function signIn(email: string, password: string) {
    await authService.signIn(email, password);
    // onAuthStateChanged listener handles setUser, refreshUser, checkEmailVerification
  }

  async function signUp(email: string, password: string) {
    await authService.signUp(email, password);
    // onAuthStateChanged listener handles setUser, refreshUser, checkEmailVerification
  }

  async function signInWithGoogle() {
    const result = await authService.signInWithGoogle();
    if (!result) return; // User cancelled
    // onAuthStateChanged listener handles setUser, refreshUser, checkEmailVerification
  }

  async function signInWithApple() {
    await authService.signInWithApple();
    // onAuthStateChanged listener handles setUser, refreshUser, checkEmailVerification
  }

  async function logout() {
    setUser(null);
    setOnboarding(false);
    setEmailVerified(true);
    setAuthError(null);
    setNoInternet(false);
    Sentry.setUser(null);

    // authService.logout() sets setLoggingOut internally (closes micro race)
    authService.logout().catch(() => {});
  }

  async function deleteAccount() {
    await authService.deleteAccount();
    setUser(null);
    setOnboarding(false);
    setEmailVerified(true);
    setAuthError(null);
    setNoInternet(false);
    Sentry.setUser(null);
  }

  function clearAuthError() {
    setAuthError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        onboarding,
        emailVerified,
        authError,
        noInternet,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithApple,
        logout,
        deleteAccount,
        refreshUser,
        checkEmailVerification,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
