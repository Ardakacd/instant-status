import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithCredential,
  GoogleAuthProvider,
  UserCredential,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  sendEmailVerification,
  deleteUser,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, mapSignInError, mapSignupError } from "../config/firebase";
import api, { resetAuthReady } from "../config/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { userService } from "./user.service";

export class AuthService {
  constructor() {
    // Configure Google Sign-In
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    if (webClientId) {
      GoogleSignin.configure({
        webClientId: webClientId, // Required for iOS and Android (OAuth 2.0 Web Client ID)
        offlineAccess: true, // If you want to access Google API on behalf of the user FROM YOUR SERVER
      });
    } else {
      console.warn(
        "Google Sign-In not configured: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing"
      );
    }
  }

  private async handleAuthSuccess(userCredential: UserCredential) {
    try {
      const idToken = await userCredential.user.getIdToken();

      // Store token
      await AsyncStorage.setItem("firebase_token", idToken);
      await AsyncStorage.setItem("firebase_uid", userCredential.user.uid);

      // Verify with backend
      const response = await api.post("/auth/firebase-token-verify", {
        idToken,
      });

      await AsyncStorage.setItem("user", JSON.stringify(response.data.user));
      await AsyncStorage.setItem(
        "onboarding",
        JSON.stringify(response.data.onboarding)
      );

      return {
        user: response.data.user,
        token: idToken,
        onboarding: response.data.onboarding,
      };
    } catch (error: any) {
      // Clean up stored data if backend verification fails
      await AsyncStorage.removeItem("firebase_token");
      await AsyncStorage.removeItem("firebase_uid");
      throw error; // Re-throw with message already extracted by interceptor
    }
  }

  async signUp(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Send email verification
      try {
        await sendEmailVerification(userCredential.user);
        console.log("Verification email sent", userCredential.user.email);
      } catch (verificationError: any) {
        // Log but don't fail signup if verification email fails
        console.warn("Failed to send verification email:", verificationError);
      }

      return this.handleAuthSuccess(userCredential);
    } catch (error: any) {
      console.error("Error signing up:", error);
      throw new Error(mapSignupError(error));
    }
  }

  async signIn(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const response = this.handleAuthSuccess(userCredential);
      return response;
    } catch (error: any) {
      console.error("Error signing in:", JSON.stringify(error, null, 2));
      throw new Error(mapSignInError(error));
    }
  }

  async logout() {
    try {
      // Unregister device token before logout to prevent ghost notifications
      try {
        const { messagingService } = await import("./messaging.service");
        const { deviceTokenService } = await import("./device-token.service");

        // Delete token from Firebase and clear cache
        await messagingService.unregister();

        // Unregister from backend using stored device token ID
        try {
          await deviceTokenService.unregisterToken();
        } catch (backendError) {
          // Don't fail logout if backend unregister fails
          console.warn(
            "Failed to unregister token from backend:",
            backendError
          );
        }
      } catch (tokenError) {
        // Don't fail logout if token unregistration fails
        console.warn("Error unregistering device token:", tokenError);
      }

      // Sign out from Google Sign-In
      try {
        await GoogleSignin.signOut();
      } catch (error) {
        // Ignore errors if user wasn't signed in with Google
        console.log("Google Sign-In sign out:", error);
      }

      await AsyncStorage.removeItem("firebase_token");
      await AsyncStorage.removeItem("firebase_uid");
      await AsyncStorage.removeItem("user");
      await AsyncStorage.removeItem("onboarding");
      await signOut(auth);
      resetAuthReady(); // Reset auth ready state so it can be re-initialized on next login
    } catch (error: any) {
      console.error("Error logging out:", error);
      throw new Error("Failed to log out");
    }
  }

  async getCurrentUser() {
    const userStr = await AsyncStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  }

  async getOnboardingStatus(): Promise<boolean> {
    const onboardingStr = await AsyncStorage.getItem("onboarding");
    return onboardingStr ? JSON.parse(onboardingStr) : false;
  }

  /**
   * Sign in or sign up with Google
   *
   * Note: Firebase automatically handles user creation on first sign-in.
   * If the user doesn't exist in Firebase Auth, it will be created automatically.
   * The backend's getOrCreateUser() method will then create the database record
   * if it doesn't exist, and return onboarding: true if first_name/last_name are missing.
   */
  async signInWithGoogle() {
    try {
      // Check if Google Play Services are available (Android)
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      // Sign in with Google
      // This works for both new users (sign-up) and existing users (sign-in)
      const signInResult = await GoogleSignin.signIn();

      // Check if sign-in was successful
      if (signInResult.type !== "success") {
        throw new Error("Google sign-in was cancelled");
      }

      // Get the ID token from the sign-in response
      const idToken = signInResult.data.idToken;

      if (!idToken) {
        throw new Error("An error occurred while signing in with Google");
      }

      // Create a Google credential with the token
      const googleCredential = GoogleAuthProvider.credential(idToken);

      // Sign in to Firebase with the Google credential
      // Firebase will automatically create the user account if it doesn't exist
      let userCredential: UserCredential;

      userCredential = await signInWithCredential(auth, googleCredential);

      // handleAuthSuccess() will verify with backend, which calls getOrCreateUser()
      // to create the database record if needed and check onboarding status
      return this.handleAuthSuccess(userCredential);
    } catch (error: any) {
      console.error("Error signing in with Google:", error);

      if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error("Google sign-in is already in progress");
      }

      throw new Error("Failed to sign in with Google");
    }
  }

  async refreshToken() {
    const user = auth.currentUser;
    if (user) {
      const idToken = await user.getIdToken(true);
      await AsyncStorage.setItem("firebase_token", idToken);
      return idToken;
    }
    throw new Error("No user logged in");
  }

  async changePassword(currentPassword: string, newPassword: string) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error("User not authenticated");
      }

      // Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        currentPassword
      );
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
      await updatePassword(currentUser, newPassword);
    } catch (error: any) {
      console.error("Error changing password:", error);

      // Map Firebase errors to user-friendly messages
      if (error.code === "auth/invalid-credential") {
        throw new Error("Current password is incorrect.");
      }
      throw new Error("An error occurred while changing password.");
    }
  }

  getAuthProvider(): string | null {
    const currentUser = auth.currentUser;
    if (currentUser?.providerData && currentUser.providerData.length > 0) {
      return currentUser.providerData[0].providerId;
    }
    return null;
  }

  async sendEmailVerification(): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No user logged in");
      }

      if (currentUser.emailVerified) {
        throw new Error("Email is already verified");
      }

      await sendEmailVerification(currentUser);
    } catch (error: any) {
      console.error("Error sending verification email:", error);
      if (error.code === "auth/too-many-requests") {
        throw new Error("Too many requests. Please try again later.");
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to send verification email");
      }
    }
  }

  isEmailVerified(): boolean {
    const currentUser = auth.currentUser;
    return currentUser?.emailVerified || false;
  }

  async reloadUser(): Promise<void> {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await currentUser.reload();
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      console.log("Sending password reset email to:", email);
      await sendPasswordResetEmail(auth, email);
      console.log("Password reset email sent successfully");
    } catch (error: any) {
      console.error("Error sending password reset email:", error);
      if (error.code === "auth/user-not-found") {
        throw new Error("No account found with this email address");
      } else if (error.code === "auth/invalid-email") {
        throw new Error("Invalid email address");
      } else if (error.code === "auth/too-many-requests") {
        throw new Error("Too many requests. Please try again later.");
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to send password reset email");
      }
    }
  }

  async deleteAccount(password?: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No user logged in");
      }

      // Check if user needs re-authentication (password users)
      const provider = this.getAuthProvider();
      if (provider === "password" && password) {
        // Re-authenticate before deletion (Firebase requirement)
        const credential = EmailAuthProvider.credential(
          currentUser.email!,
          password
        );
        await reauthenticateWithCredential(currentUser, credential);
      }

      // Store Firebase UID before deletion (needed for backend deletion)
      const firebaseUid = currentUser.uid;

      // First, delete from Firebase Auth
      // This prevents the user from authenticating if backend deletion fails
      await deleteUser(currentUser);

      // Then delete from backend database using Firebase UID
      // This endpoint doesn't require a valid token since Firebase user is already deleted
      try {
        await userService.deleteByFirebaseUid(firebaseUid);
      } catch (backendError: any) {
        // Log but don't throw - Firebase deletion succeeded, so user is effectively deleted
        console.error(
          "Backend deletion failed after Firebase deletion:",
          backendError
        );
        // User can't authenticate anymore, so orphaned backend data is acceptable
      }

      // Clean up local storage
      await AsyncStorage.removeItem("firebase_token");
      await AsyncStorage.removeItem("firebase_uid");
      await AsyncStorage.removeItem("user");
      await AsyncStorage.removeItem("onboarding");

      // Sign out from Google Sign-In if applicable
      try {
        await GoogleSignin.signOut();
      } catch (error) {
        // Ignore errors if user wasn't signed in with Google
        console.log("Google Sign-In sign out:", error);
      }

      resetAuthReady(); // Reset auth ready state
    } catch (error: any) {
      console.error("Error deleting account:", error);

      // If Firebase deletion failed, user still exists and can authenticate
      // Don't clean up local storage - let them try again
      // Only clean up if Firebase deletion succeeded but something else failed
      if (
        error.code !== "auth/requires-recent-login" &&
        error.code !== "auth/invalid-credential" &&
        error.code !== "auth/user-not-found"
      ) {
        // Firebase deletion might have succeeded, clean up local storage
        try {
          await AsyncStorage.removeItem("firebase_token");
          await AsyncStorage.removeItem("firebase_uid");
          await AsyncStorage.removeItem("user");
          await AsyncStorage.removeItem("onboarding");
          resetAuthReady();
        } catch (cleanupError) {
          console.error(
            "Error cleaning up after account deletion:",
            cleanupError
          );
        }
      }

      if (error.code === "auth/invalid-credential") {
        throw new Error("Password is incorrect");
      } else if (error.code === "auth/requires-recent-login") {
        throw new Error(
          "For security reasons, please log out and log back in before deleting your account"
        );
      } else if (error.response?.status === 404) {
        throw new Error("User not found");
      } else if (error.response?.status === 401) {
        throw new Error("You are not authorized");
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to delete account");
      }
    }
  }
}

export const authService = new AuthService();
