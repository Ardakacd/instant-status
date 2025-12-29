import api from "../config/api";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_TOKEN_ID_KEY = "device_token_id";

export class DeviceTokenService {
  /**
   * Register device token and store the returned ID
   * Updates stored ID if token refreshes (same user, new token)
   */
  async registerToken(token: string): Promise<void> {
    const response = await api.post("/device-token", {
      token,
      platform: Platform.OS === "ios" ? "iOS" : "Android",
    });

    // Store the device token ID for later deletion
    // This will overwrite any previous ID (handles token refresh case)
    if (response.data?.id) {
      await AsyncStorage.setItem(DEVICE_TOKEN_ID_KEY, response.data.id);
    }
  }

  /**
   * Delete device token by ID
   */
  async deleteToken(id: string): Promise<void> {
    await api.delete(`/device-token/${id}`);
  }

  /**
   * Unregister current device token
   * Uses the stored device token ID to delete from backend
   * Falls back gracefully if ID is not found
   */
  async unregisterToken(): Promise<void> {
    try {
      // Get stored device token ID
      const deviceTokenId = await AsyncStorage.getItem(DEVICE_TOKEN_ID_KEY);

      if (deviceTokenId) {
        // Delete using the stored ID
        await this.deleteToken(deviceTokenId);
        // Clear stored ID
        await AsyncStorage.removeItem(DEVICE_TOKEN_ID_KEY);
      } else {
        console.warn(
          "Device token ID not found, cannot unregister from backend"
        );
      }
    } catch (error: any) {
      // Don't fail logout if backend deletion fails
      // The token will be invalidated on Firebase side anyway
      console.warn("Could not unregister token from backend:", error.message);
      // Still try to clear stored ID
      await AsyncStorage.removeItem(DEVICE_TOKEN_ID_KEY).catch(() => {});
    }
  }
}

export const deviceTokenService = new DeviceTokenService();
