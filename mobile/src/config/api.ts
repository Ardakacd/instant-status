import axios from "axios";
import { auth } from "./firebase";
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

export async function getFreshToken(forceRefresh = false) {
  // Wait for Firebase Auth to finish restoring the session
  await waitForAuthReady();

  if (!auth.currentUser) return null;

  // Use cached token if available (faster), or force refresh if needed
  // Firebase automatically refreshes expired tokens, so we don't need to force refresh every time
  return await auth.currentUser.getIdToken(forceRefresh);
}

// Reset auth ready promise when user logs out (called from auth service)
export function resetAuthReady() {
  authReadyPromise = null;
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
  }
);

// Handle API errors consistently
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

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
      
      if (errorCode === 'TOKEN_INVALID' && !originalRequest._retry && auth.currentUser) {
        // Token expired/invalid - retry once with fresh token
        originalRequest._retry = true;
        
        const freshToken = await getFreshToken(true);
        if (freshToken) {
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return api(originalRequest);
        }
      }

      // Check if user has stored auth data (meaning they should be logged in)
      const hasStoredUser = await AsyncStorage.getItem("user");
      const hasStoredFirebaseUid = await AsyncStorage.getItem("firebase_uid");

      // If AUTH_REQUIRED but user has stored data, it means they should be logged in but aren't
      // This is a real auth failure, not initialization
      const isRealAuthFailure = 
        errorCode === 'UNAUTHORIZED' || 
        (errorCode === 'AUTH_REQUIRED' && (hasStoredUser || hasStoredFirebaseUid || auth.currentUser));

      if (isRealAuthFailure) {
        // Real authorization failure - use authService.logout() for complete cleanup
        // This ensures widget storage, device tokens, and all auth state are cleared
        try {
          // Import authService dynamically to avoid circular dependencies
          const { authService } = await import("../services/auth.service");
          
          // Use the full logout flow to ensure complete cleanup:
          // - Unregister device tokens
          // - Clear widget storage
          // - Sign out from Google Sign-In
          // - Clear AsyncStorage (batch)
          // - Sign out from Firebase
          // - Reset auth ready state
          await authService.logout();
          
          // Note: AuthContext will detect the Firebase auth state change
          // and update the UI accordingly via onAuthStateChanged listener
        } catch (logoutError) {
          console.error("Error during logout from API interceptor:", logoutError);
          // Even if logout fails, try to clear minimal state to prevent stuck state
          try {
            await signOut(auth);
            resetAuthReady();
          } catch (fallbackError) {
            console.error("Fallback logout also failed:", fallbackError);
          }
        }
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
          if (data.message.length > 0 && typeof data.message[0] === "object" && "field" in data.message[0]) {
            // New format: array of { field, message } objects
            fieldErrors = data.message as Array<{ field: string; message: string }>;
            // Create a readable error message from all field errors
            errorMessage = fieldErrors.map((err) => `${err.field}: ${err.message}`).join(", ");
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
        "Network error. Please check your internet connection."
      );
      (networkError as any).isNetworkError = true;
      return Promise.reject(networkError);
    }

    // Unknown error
    return Promise.reject(error);
  }
);

export default api;
