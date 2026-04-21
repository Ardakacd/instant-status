import api from "../config/api";
import { Status } from "../types";

export class StatusService {
  /** Coalesces overlapping GET /status/friends (e.g. mount + useFocusEffect + push). */
  private friendsStatusInFlight: Promise<Status[]> | null = null;

  async getMyStatus(): Promise<Status> {
    const response = await api.get("/status/me");
    return response.data;
  }

  async updateStatus(
    optionId: string,
    note?: string,
    expiresAt?: Date,
  ): Promise<Status> {
    const response = await api.patch("/status", {
      option_id: optionId,
      note,
      expires_at: expiresAt?.toISOString(),
    });
    return response.data;
  }

  async getFriendsStatus(): Promise<Status[]> {
    if (this.friendsStatusInFlight) {
      return this.friendsStatusInFlight;
    }
    this.friendsStatusInFlight = api
      .get("/status/friends")
      .then((response) => response.data)
      .finally(() => {
        this.friendsStatusInFlight = null;
      });
    return this.friendsStatusInFlight;
  }
}

export const statusService = new StatusService();
