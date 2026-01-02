import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  Auth,
} from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
};

const app: FirebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

// Initialize Auth only if it hasn't been initialized yet
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (error: any) {
  // Auth already initialized, get the existing instance
  if (error.code === "auth/already-initialized") {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

function mapSignInError(error: any): string {
  switch (error.code) {
    case "auth/invalid-credential":
      return "Email or password is incorrect.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    default:
      return "Unable to sign in. Please try again.";
  }
}

function mapSignupError(error: any): string {
  switch (error.code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email.";
    case "auth/password-does-not-meet-requirements":
      return "Password must be at least 8 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    default:
      return "Unable to create account. Please try again.";
  }
}

export { app, auth, mapSignInError, mapSignupError };
