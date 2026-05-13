import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { User } from "../types";
import { authService } from "../services/auth.service";
import { userService } from "../services/user.service";
import Sentry from "../../sentry";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../config/firebase";
import { setOnSessionDead, getLoggingOut } from "../config/api";
import Purchases from "react-native-purchases";
import { widgetStorageService } from "../services/widget-storage.service";

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
  // Firebase JS SDK can fire onAuthStateChanged twice during signup; without
  // dedup, parallel /auth/sync calls trigger parallel verification-email sends
  // and burn Firebase's per-email quota.
  const inFlightSyncRef = useRef<Promise<void> | null>(null);

  /**
   * Atomic sync: one API call returns user, onboarding, emailVerified.
   * Replaces the old verify + getMe + checkEmailVerification triple-call race.
   */
  async function refreshUser() {
    if (inFlightSyncRef.current) return inFlightSyncRef.current;
    const promise = doRefreshUser();
    inFlightSyncRef.current = promise;
    try {
      await promise;
    } finally {
      inFlightSyncRef.current = null;
    }
  }

  async function doRefreshUser() {
    if (getLoggingOut()) return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;

    try {
      const idToken = await firebaseUser.getIdToken();
      let result = await authService.syncWithBackend(idToken);

      // For Sign in with Apple / Google, the OAuth provider already gave us a name.
      // Apple guideline 4 explicitly forbids re-prompting for it; Google offers the
      // same data, so we apply the same UX. If neither provider shared a name,
      // fall back to email parts (real email) or a neutral placeholder.
      if (result.onboarding) {
        const isApple = firebaseUser.providerData.some(
          (p) => p?.providerId === "apple.com",
        );
        const isGoogle = firebaseUser.providerData.some(
          (p) => p?.providerId === "google.com",
        );

        if (isApple || isGoogle) {
          const appleGivenName = (await AsyncStorage.getItem("apple_given_name") ?? "").trim();
          const appleFamilyName = (await AsyncStorage.getItem("apple_family_name") ?? "").trim();

          // Google: Firebase populates displayName from the Google profile.
          const displayParts = (firebaseUser.displayName ?? "").trim().split(/\s+/);
          const googleFirst = displayParts[0] ?? "";
          const googleLast = displayParts.slice(1).join(" ");

          const email = firebaseUser.email ?? "";
          const isPrivateRelay = email.endsWith("@privaterelay.appleid.com");
          const emailPrefix = email.split("@")[0] ?? "";
          const emailParts = isPrivateRelay
            ? []
            : emailPrefix.split(/[._\-+]/).filter(Boolean);

          const firstName =
            appleGivenName || googleFirst || emailParts[0] || (isApple ? "Apple" : "Google");
          const lastName =
            appleFamilyName || googleLast || emailParts[1] || "User";

          try {
            await userService.updateMe({ first_name: firstName, last_name: lastName });
            if (isApple) {
              await AsyncStorage.removeItem("apple_given_name");
              await AsyncStorage.removeItem("apple_family_name");
            }
            result = await authService.syncWithBackend(idToken);
          } catch (updateError) {
            Sentry.captureException(updateError);
          }
        }
      }

      setUser(result.user);
      setOnboarding(result.onboarding);
      const verified = result.emailVerified;
      setEmailVerified(verified);
      setAuthError(
        verified ? null : "Please verify your email address to continue."
      );
      setNoInternet(false);

      Sentry.setUser({ id: result.user.firebase_uid });
      await AsyncStorage.setItem("firebase_uid", result.user.firebase_uid);
      // Let the iOS NSE accept pushes again before HomeScreen runs saveAllFriendStatuses.
      widgetStorageService.clearLoggedOutFlag();
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

      // Transient server error (5xx, unexpected 4xx) — don't log the user out.
      // A brief outage would otherwise silently sign out every user who opens the app.
      Sentry.captureException(error);
      setNoInternet(false);
      setAuthError("Something went wrong. Please try again.");
    }
  }

  refreshUserRef.current = refreshUser;

  /** Re-sync to get fresh emailVerified; same as refreshUser. */
  const checkEmailVerification = useCallback(async () => {
    await refreshUserRef.current();
  }, []);

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
    authService.logout().catch((error) => { Sentry.captureException(error); });
  }

  async function deleteAccount() {
    setLoading(true);
    await authService.deleteAccount();
    setUser(null);
    setOnboarding(false);
    setEmailVerified(true);
    setAuthError(null);
    setNoInternet(false);
    setLoading(false);
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
