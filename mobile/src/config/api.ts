import axios from "axios";
import { auth } from "./firebase";

declare module "axios" {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}

/** API error with typed flags for error handling */
export interface ApiError {
  isSessionDead?: boolean;
  isNetworkError?: boolean;
}

import { onAuthStateChanged, signOut } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// Cache for auth state initialization promise
let authReadyPromise: Promise<void> | null = null;

// Flag to track if logout is in progress (prevents race conditions with API interceptor)
let isLoggingOut = false;

export function setLoggingOut(value: boolean) {
  isLoggingOut = value;
}

export function getLoggingOut(): boolean {
  return isLoggingOut;
}

// Event pattern: interceptor broadcasts "session dead" instead of importing authService
// (breaks circular dep: api ↔ authService). AuthContext registers the handler.
let onSessionDead: (() => Promise<void>) | null = null;

export function setOnSessionDead(handler: (() => Promise<void>) | null) {
  onSessionDead = handler;
}

async function waitForAuthReady(): Promise<void> {
  // If auth already has a current user, it's likely initialized
  // But we still want to wait for the first auth state change to be sure
  if (authReadyPromise) {
    return authReadyPromise;
  }

  authReadyPromise = new Promise((resolve) => {
    // onAuthStateChanged fires immediately if auth is already initialized
    // and whenever auth state changes
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve();
    });
  });

  return authReadyPromise;
}

let refreshPromise: Promise<string | null> | null = null;

export async function getFreshToken(forceRefresh = false) {
  await waitForAuthReady();

  if (!auth.currentUser) return null;

  // If a force refresh is already in progress, everyone waits for the SAME result
  if (forceRefresh && refreshPromise) {
    return refreshPromise;
  }

  if (forceRefresh) {
    refreshPromise = auth.currentUser
      .getIdToken(true)
      .catch(() => null) // Corrupted/revoked/deleted → null, no crash
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  try {
    return await auth.currentUser.getIdToken(false);
  } catch {
    return null;
  }
}

// Reset auth state when user logs out (called from auth service)
export function resetAuthReady() {
  authReadyPromise = null;
  refreshPromise = null;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await getFreshToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Handle API errors consistently
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !isLoggingOut) {
      // Don't handle 401 errors if logout is already in progress
      // This prevents race conditions where the interceptor tries to logout
      // while the user is already logging out

      const { data } = error.response;
      const errorCode = data?.errorCode;

      // Use structured error codes for reliable error handling
      // AUTH_REQUIRED: Missing token (expected during initialization, don't retry)
      // TOKEN_INVALID: Token expired/invalid (retry with fresh token)
      // UNAUTHORIZED: User not found or other auth failure (logout)

      if (
        errorCode === "TOKEN_INVALID" &&
        !originalRequest._retry &&
        auth.currentUser
      ) {
        originalRequest._retry = true;

        const freshToken = await getFreshToken(true);
        if (freshToken) {
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return api(originalRequest);
        }
        // getFreshToken returned null: corrupted token, revoked session, or user deleted
        setLoggingOut(true);
        try {
          if (onSessionDead) {
            await onSessionDead();
          } else {
            await signOut(auth);
            await AsyncStorage.removeItem("firebase_uid");
            resetAuthReady();
          }
        } catch (e) {
          try {
            await signOut(auth);
            await AsyncStorage.removeItem("firebase_uid");
            resetAuthReady();
          } catch {}
        } finally {
          setLoggingOut(false);
        }
        (error as ApiError).isSessionDead = true;
        return Promise.reject(error);
      }

      const hasStoredFirebaseUid = await AsyncStorage.getItem("firebase_uid");

      const isRealAuthFailure =
        errorCode === "UNAUTHORIZED" ||
        (errorCode === "AUTH_REQUIRED" &&
          (hasStoredFirebaseUid || auth.currentUser));

      if (isRealAuthFailure) {
        setLoggingOut(true);
        try {
          if (onSessionDead) {
            await onSessionDead();
          } else {
            await signOut(auth);
            await AsyncStorage.removeItem("firebase_uid");
            resetAuthReady();
          }
        } catch (logoutError) {
          console.error("Session dead handler failed:", logoutError);
          try {
            await signOut(auth);
            await AsyncStorage.removeItem("firebase_uid");
            resetAuthReady();
          } catch (fallbackError) {
            console.error("Fallback cleanup failed:", fallbackError);
          }
        } finally {
          setLoggingOut(false);
        }
        (error as ApiError).isSessionDead = true;
        return Promise.reject(error);
      }

      // AUTH_REQUIRED errors without stored user data are expected during initialization
    }

    // Extract error message from backend's consistent error format
    if (error.response) {
      const { data } = error.response;

      // Backend returns: { statusCode, message: string | string[] | Array<{field, message}>, error, timestamp, path }
      if (data && data.message) {
        let errorMessage: string;
        let fieldErrors: Array<{ field: string; message: string }> | undefined;

        if (Array.isArray(data.message)) {
          // Check if it's the new format (array of objects with field and message)
          if (
            data.message.length > 0 &&
            typeof data.message[0] === "object" &&
            "field" in data.message[0]
          ) {
            // New format: array of { field, message } objects
            fieldErrors = data.message as Array<{
              field: string;
              message: string;
            }>;
            // Create a readable error message from all field errors
            errorMessage = fieldErrors
              .map((err) => `${err.field}: ${err.message}`)
              .join(", ");
          } else {
            // Old format: array of strings
            errorMessage = data.message.join(", ");
          }
        } else {
          // Single string message
          errorMessage = data.message;
        }

        // Create a new error with the extracted message
        const apiError = new Error(errorMessage);
        // Preserve status code, field errors, and original error data
        (apiError as any).statusCode = data.statusCode || error.response.status;
        (apiError as any).fieldErrors = fieldErrors;
        (apiError as any).originalError = error;
        return Promise.reject(apiError);
      }

      // Fallback if backend doesn't return expected format
      const errorMessage =
        data?.message || error.message || "An error occurred";
      const apiError = new Error(errorMessage);
      (apiError as any).statusCode = error.response.status;
      (apiError as any).originalError = error;
      return Promise.reject(apiError);
    }

    // Network error or no response
    if (error.request) {
      const networkError = new Error(
        "Network error. Please check your internet connection.",
      ) as Error & ApiError;
      networkError.isNetworkError = true;
      return Promise.reject(networkError);
    }

    // Unknown error
    return Promise.reject(error);
  },
);

export default api;
