import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "../types";
import { authService } from "../services/auth.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../config/firebase";
import { setLoggingOut } from "../config/api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  onboarding: boolean;
  emailVerified: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  checkEmailVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true); // Default to true for Google users

  useEffect(() => {
    loadUser();
  }, []);

  // Listen for auth state changes to handle logout from API interceptor and email verification
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        // Firebase user signed out, clear local state
        setUser(null);
        setOnboarding(false);
        setEmailVerified(true);
      } else {
        // Check email verification status
        await checkEmailVerification();
      }
    });

    return unsubscribe;
  }, []);

  async function checkEmailVerification() {
    try {
      const provider = authService.getAuthProvider();
      if (provider === "password") {
        await authService.reloadUser();
        const isVerified = authService.isEmailVerified();
        setEmailVerified(isVerified);
      } else {
        // Google and Apple users are automatically verified
        setEmailVerified(true);
      }
    } catch (error) {
      // Silently handle errors - verification check will retry on next auth state change
    }
  }

  async function loadUser() {
    try {
      const storedUser = await authService.getCurrentUser();

      if (storedUser) {
        setUser(storedUser);
        // Check onboarding status based on user data
        const needsOnboarding = !storedUser.first_name || !storedUser.last_name;
        setOnboarding(needsOnboarding);
        // Check email verification status
        await checkEmailVerification();
      }
    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    const result = await authService.signIn(email, password);
    setUser(result.user);
    setOnboarding(result.onboarding || false);
    await checkEmailVerification();
  }

  async function signUp(email: string, password: string) {
    const result = await authService.signUp(email, password);
    setUser(result.user);
    setOnboarding(result.onboarding || false);
    await checkEmailVerification();
  }

  async function signInWithGoogle() {
    const result = await authService.signInWithGoogle();
    // Handle cancellation (result is undefined)
    if (!result) {
      return;
    }
    setUser(result.user);
    setOnboarding(result.onboarding || false);
    // Google users are automatically verified
    setEmailVerified(true);
  }

  async function signInWithApple() {
    const result = await authService.signInWithApple();
    setUser(result.user);
    setOnboarding(result.onboarding || false);
    // Apple users are automatically verified
    setEmailVerified(true);
  }

  async function completeOnboarding() {
    setOnboarding(false);
    await AsyncStorage.setItem("onboarding", JSON.stringify(false));
  }

  async function logout() {
    // Mark that logout is in progress to prevent API interceptor race conditions
    setLoggingOut(true);
    
    // Clear state immediately for snappy UI - show login screen right away
    setUser(null);
    setOnboarding(false);
    setEmailVerified(true);
    
    // Perform async cleanup in the background
    // Don't await - let it run in background, errors are handled internally
    authService.logout()
      .catch((error) => {
        // Log error but don't throw - user is already logged out in UI
        console.error("Error during logout cleanup:", error);
      })
      .finally(() => {
        // Reset logout flag when cleanup completes (or fails)
        setLoggingOut(false);
      });
  }

  async function deleteAccount() {
    await authService.deleteAccount();
    setUser(null);
    setOnboarding(false);
    setEmailVerified(true);
  }

  async function refreshUser() {
    // Fetch fresh user data from backend
    const { userService } = await import("../services/user.service");
    try {
      const updatedUser = await userService.getMe();
      setUser(updatedUser);
      await AsyncStorage.setItem("user", JSON.stringify(updatedUser));

      // Check onboarding status based on user data
      const needsOnboarding = !updatedUser.first_name || !updatedUser.last_name;
      setOnboarding(needsOnboarding);
      await AsyncStorage.setItem("onboarding", JSON.stringify(needsOnboarding));
    } catch (error) {
      console.error("Error refreshing user:", error);
      // Fallback to stored user
      const storedUser = await authService.getCurrentUser();
      if (storedUser) {
        setUser(storedUser);
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        onboarding,
        emailVerified,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithApple,
        logout,
        deleteAccount,
        refreshUser,
        completeOnboarding,
        checkEmailVerification,
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
