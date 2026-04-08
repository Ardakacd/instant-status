import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  UserCredential,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth, mapSignInError, mapSignupError } from "../config/firebase";
import api, { resetAuthReady, setLoggingOut } from "../config/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import Purchases from "react-native-purchases";

export class AuthService {
  constructor() {
    // Configure Google Sign-In
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    if (webClientId) {
      GoogleSignin.configure({
        webClientId: webClientId, // Required for iOS and Android (OAuth 2.0 Web Client ID)
        offlineAccess: true, // If you want to access Google API on behalf of the user FROM YOUR SERVER
      });
    } else if (__DEV__) {
      console.warn("Google Sign-In not configured: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing");
    }
  }

  /**
   * Sync auth state with backend. Single atomic call that verifies token,
   * gets/creates user, and returns user + onboarding + emailVerified.
   * Replaces the old verify + getMe + checkEmailVerification triple-call.
   */
  async syncWithBackend(idToken: string): Promise<{
    user: {
      id: string;
      firebase_uid: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      is_premium: boolean;
      premium_until: string | null;
      is_in_grace_period: boolean;
      should_reset_custom_status: boolean;
    };
    onboarding: boolean;
    emailVerified: boolean;
  }> {
    const response = await api.post("/auth/sync", { idToken });
    return response.data;
  }

  /**
   * Called after Firebase sign-in. Stores minimal state for the brief moment
   * before onAuthStateChanged runs sync. No return needed - sync drives UI state.
   */
  private async handleAuthSuccess(
    userCredential: UserCredential,
  ): Promise<void> {
    await AsyncStorage.setItem("firebase_uid", userCredential.user.uid);
  }

  private async logOutRevenueCat(): Promise<void> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const isAnonymous =
        customerInfo?.originalAppUserId?.startsWith("$RCAnonymousID:") ?? false;
      if (!isAnonymous) {
        await Purchases.logOut();
      }
    } catch {
    }
  }

  /**
   * Unregister device token: Firebase messaging + optional backend.
   * When unregisterFromBackend=false (e.g. after delete account), skip backend -
   * /auth/account cascade already deleted tokens.
   */
  private async unregisterDeviceToken(
    unregisterFromBackend = true
  ): Promise<void> {
    try {
      const { messagingService } = await import("./messaging.service");
      await messagingService.unregister();
      if (unregisterFromBackend) {
        const { deviceTokenService } = await import("./device-token.service");
        try {
          await deviceTokenService.unregisterToken();
        } catch {
        }
      }
    } catch {
    }
  }

  private async signOutGoogle(): Promise<void> {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Ignore errors if user wasn't signed in with Google
    }
  }

  private async clearWidgetStorage(): Promise<void> {
    try {
      const { widgetStorageService } = await import("./widget-storage.service");
      await widgetStorageService.clearAll();
    } catch {
    }
  }

  async signUp(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      await this.handleAuthSuccess(userCredential);
      return;
    } catch (error: any) {
      throw new Error(mapSignupError(error));
    }
  }

  async signIn(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await this.handleAuthSuccess(userCredential);
    } catch (error: any) {
      throw new Error(mapSignInError(error));
    }
  }

  async logout(unregisterDeviceToken = true) {
    setLoggingOut(true);
    try {
      await this.logOutRevenueCat();

      await this.unregisterDeviceToken(unregisterDeviceToken);

      await this.signOutGoogle();
      await this.clearWidgetStorage();

      await AsyncStorage.removeItem("firebase_uid");

      await signOut(auth);
      resetAuthReady(); // Reset auth ready state so it can be re-initialized on next login
    } catch (error: any) {
      throw new Error("Failed to log out");
    } finally {
      setLoggingOut(false);
    }
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
        // User cancelled - return early without throwing to avoid showing error
        return;
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

      await this.handleAuthSuccess(userCredential);
      return true; // Success - AuthContext uses !result to detect cancel
    } catch (error: any) {

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled the flow (tapped back on Android or Cancel on iOS)
        // Return undefined to indicate cancellation without throwing
        return undefined as any;
      }

      if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error("Google sign-in is already in progress");
      }

      throw new Error("Failed to sign in with Google");
    }
  }

  async signInWithApple() {
    try {
      // Check if Apple Authentication is available
      if (!AppleAuthentication || !AppleAuthentication.isAvailableAsync) {
        throw new Error("Apple Sign In is not available on this device");
      }

      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error("Apple Sign In is not available on this device");
      }

      // Request Apple Sign In — FULL_NAME is only provided on first sign-in,
      // so it must be requested here or it's permanently unavailable.
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      const { identityToken, fullName } = appleCredential;

      // Store the Apple-provided name for the onboarding flow.
      // Apple only provides name on the first sign-in — capture it now or lose it forever.
      if (fullName?.givenName || fullName?.familyName) {
        await AsyncStorage.setItem("apple_given_name", fullName.givenName ?? "");
        await AsyncStorage.setItem("apple_family_name", fullName.familyName ?? "");
      }

      if (!identityToken) {
        throw new Error("Apple Sign In failed - no identity token received");
      }

      // Create Firebase credential with Apple identity token
      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({
        idToken: identityToken,
      });

      // Sign in to Firebase with Apple credential
      // Firebase will automatically create the user account if it doesn't exist
      let userCredential: UserCredential;
      try {
        userCredential = await signInWithCredential(auth, credential);
      } catch (firebaseError: any) {
        throw new Error("Failed to sign in with Apple");
      }

      await this.handleAuthSuccess(userCredential);
    } catch (error: any) {
      // Handle user cancellation silently — same behaviour as Google Sign-In
      if (
        error.code === "ERR_REQUEST_CANCELED" ||
        error.message?.includes("cancel")
      ) {
        return;
      }

      throw new Error("Failed to sign in with Apple");
    }
  }

  async refreshToken() {
    const user = auth.currentUser;
    if (user) {
      return user.getIdToken(true);
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
        currentPassword,
      );
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
      await updatePassword(currentUser, newPassword);
    } catch (error: any) {
      // Map Firebase errors to user-friendly messages
      if (error.code === "auth/requires-recent-login") {
        throw new Error("For security, please log out and log back in before changing your password.");
      }
      if (error.code === "auth/invalid-credential") {
        throw new Error("Current password is incorrect.");
      }
      throw new Error("An error occurred while changing password.");
    }
  }

  getAuthProvider(): string | null {
    const providers = auth.currentUser?.providerData ?? [];
    // If the user has a password provider (possibly alongside a social provider),
    // return 'password' so the profile screen shows the "Change password" option.
    if (providers.some((p) => p.providerId === "password")) return "password";
    return providers[0]?.providerId ?? null;
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

      // Send email verification via backend (uses Postmark)
      await api.post("/auth/send-email-verification");
    } catch (error: any) {
      // Preserve statusCode so callers (e.g. EmailVerificationScreen) can detect 429
      const err = new Error(error.message || "Failed to send verification email") as any;
      if (error.response?.status) err.statusCode = error.response.status;
      else if (error.statusCode) err.statusCode = error.statusCode;
      throw err;
    }
  }

  isEmailVerified(): boolean {
    const currentUser = auth.currentUser;
    return currentUser?.emailVerified || false;
  }

  /**
   * Verify email using action code from email verification link
   */
  async verifyEmail(oobCode: string): Promise<void> {
    try {
      await applyActionCode(auth, oobCode);

      // Reload user to get updated emailVerified status, then force-refresh the
      // ID token so the email_verified: true claim is reflected in the JWT.
      // Without forceRefresh the cached token (valid for up to 1 hour) would
      // still carry email_verified: false and the backend sync would reject the user.
      const currentUser = auth.currentUser;
      if (currentUser) {
        await currentUser.reload();
        await currentUser.getIdToken(true);
      }
    } catch (error: any) {
      if (error.code === "auth/expired-action-code") {
        throw new Error(
          "Verification link has expired. Please request a new one.",
        );
      } else if (error.code === "auth/invalid-action-code") {
        throw new Error("Invalid verification link. Please request a new one.");
      } else {
        throw new Error("Failed to verify email. Please try again.");
      }
    }
  }

  async reloadUser(): Promise<void> {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await currentUser.reload();
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      // Call backend endpoint instead of Firebase directly
      // This ensures we use our custom email template and have better control
      await api.post("/auth/forgot-password", { email });
    } catch (error: any) {
      if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error("Failed to send password reset email");
      }
    }
  }

  /**
   * Verify a password reset code is still valid (not expired/already used).
   * Throws if the code is invalid or expired.
   */
  async verifyResetCode(oobCode: string): Promise<void> {
    try {
      await verifyPasswordResetCode(auth, oobCode);
    } catch (error: any) {
      if (error.code === "auth/expired-action-code") {
        throw new Error("Password reset link has expired. Please request a new one.");
      }
      throw new Error("Invalid password reset link. Please request a new one.");
    }
  }

  /**
   * Confirm password reset using action code from email link
   */
  async confirmPasswordReset(
    oobCode: string,
    newPassword: string,
  ): Promise<void> {
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
    } catch (error: any) {
      if (error.code === "auth/expired-action-code") {
        throw new Error(
          "Password reset link has expired. Please request a new one.",
        );
      } else if (error.code === "auth/invalid-action-code") {
        throw new Error(
          "Invalid password reset link. Please request a new one.",
        );
      } else if (error.code === "auth/weak-password") {
        throw new Error(
          "Password is too weak. Please choose a stronger password.",
        );
      } else {
        throw new Error("Failed to reset password. Please try again.");
      }
    }
  }

  /**
   * Backend-led deletion: one authenticated request wipes DB + Firebase.
   * Cascade deletes device tokens, so logout(false) skips backend unregister.
   * Local cleanup reuses logout() - RevenueCat, widget, signOut.
   */
  async deleteAccount(): Promise<void> {
    if (!auth.currentUser) {
      throw new Error("No user logged in");
    }

    await api.delete("/auth/account");
    // Account is deleted server-side — local cleanup is best-effort.
    // Don't let a signOut failure block the AuthContext from clearing state.
    await this.logout(false).catch(() => {});
  }
}

export const authService = new AuthService();
