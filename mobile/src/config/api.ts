import axios from "axios";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchSignInMethodsForEmail } from "firebase/auth";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// Cache for auth state initialization promise
let authReadyPromise: Promise<void> | null = null;

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

export async function getFreshToken() {
  // Wait for Firebase Auth to finish restoring the session
  await waitForAuthReady();

  if (!auth.currentUser) return null;

  return await auth.currentUser.getIdToken(true);
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
    // Handle 401 Unauthorized errors
    if (error.response?.status === 401) {
      const { data } = error.response;
      const errorMessage = data?.message;

      // Check if it's an authorization error
      if (
        errorMessage.includes("not authorized") ||
        errorMessage.includes("unauthorized") ||
        errorMessage.includes("You are not authorized")
      ) {
        // Clear auth state and navigate to login
        try {
          // Clear stored auth data
          await AsyncStorage.removeItem("firebase_token");
          await AsyncStorage.removeItem("firebase_uid");
          await AsyncStorage.removeItem("user");
          await AsyncStorage.removeItem("onboarding");

          // Sign out from Firebase
          await signOut(auth);

          // Reset auth ready state
          resetAuthReady();

          // Emit a custom event that AuthContext can listen to
          // This will trigger the navigation to login via AuthContext's user state change
          console.log("Session expired. Please sign in again.");
        } catch (logoutError) {
          console.error("Error during logout:", logoutError);
        }
      }
    }

    // Extract error message from backend's consistent error format
    if (error.response) {
      const { data } = error.response;

      // Backend returns: { statusCode, message: string | string[], error, timestamp, path }
      if (data && data.message) {
        // If message is an array, join it; otherwise use as string
        const errorMessage = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;

        // Create a new error with the extracted message
        const apiError = new Error(errorMessage);
        // Preserve status code and original error data
        (apiError as any).statusCode = data.statusCode || error.response.status;
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
