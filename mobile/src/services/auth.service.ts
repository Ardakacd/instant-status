import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithCredential,
  GoogleAuthProvider,
  Auth,
  UserCredential,
} from "firebase/auth";
import { auth, mapSignInError, mapSignupError } from "../config/firebase";
import api, { resetAuthReady } from "../config/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";

export class AuthService {
  private getGoogleAuthConfig() {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "Google Web Client ID not configured. Please set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your .env file."
      );
    }
    return {
      clientId,
      scopes: ["openid", "profile", "email"],
      redirectUri: AuthSession.makeRedirectUri({ native: "com.example.app" }),
    };
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

  async signInWithGoogle() {
    try {
      const config = this.getGoogleAuthConfig();

      // Create the auth request
      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        scopes: config.scopes,
        redirectUri: config.redirectUri,
        responseType: AuthSession.ResponseType.IdToken,
        usePKCE: false,
      });

      // Start the auth session
      const result = await request.promptAsync({
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      });

      if (result.type !== "success") {
        if (result.type === "cancel") {
          throw new Error("Google sign-in was cancelled");
        }
        throw new Error("Google sign-in failed");
      }

      // Get the ID token from the result
      const { id_token } = result.params;

      if (!id_token) {
        throw new Error("No ID token received from Google");
      }

      // Create a Google credential with the token
      const googleCredential = GoogleAuthProvider.credential(id_token);

      // Sign in to Firebase with the Google credential
      const userCredential = await signInWithCredential(
        auth as Auth,
        googleCredential
      );

      return this.handleAuthSuccess(userCredential);
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      throw new Error(error.message || "Failed to sign in with Google");
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
}

export const authService = new AuthService();
