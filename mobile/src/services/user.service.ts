import api from "../config/api";
import { User } from "../types";

export interface UserMeResponse extends User {
  is_premium?: boolean;
  premium_until?: string | null;
  is_in_grace_period?: boolean;
  should_reset_custom_status?: boolean;
}

export class UserService {
  async getMe(): Promise<UserMeResponse> {
    const response = await api.get("/user/me");
    return response.data;
  }

  async updateMe(data: {
    first_name?: string;
    last_name?: string;
    email?: string;
    display_name?: string;
  }): Promise<User> {
    const response = await api.patch("/user/me", data);
    return response.data;
  }

  async deleteMe(): Promise<void> {
    await api.delete("/user/me");
  }

  async deleteByFirebaseUid(firebaseUid: string): Promise<void> {
    await api.delete("/user/by-firebase-uid", {
      data: { firebase_uid: firebaseUid },
    });
  }

  async updatePremiumStatus(
    isPremium: boolean,
    premiumUntil?: string | null,
    revenuecatId?: string | null
  ): Promise<void> {
    await api.patch("/user/me/premium", {
      is_premium: isPremium,
      premium_until: premiumUntil,
      revenuecat_id: revenuecatId,
    });
  }
}

export const userService = new UserService();
