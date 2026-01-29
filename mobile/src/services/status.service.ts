import api from "../config/api";
import { Status } from "../types";

export class StatusService {
  async getMyStatus(): Promise<Status> {
    const response = await api.get("/status/me");
    return response.data;
  }

  async updateStatus(
    optionId: string,
    note?: string,
    expiresAt?: Date
  ): Promise<Status> {
    const response = await api.patch("/status", {
      option_id: optionId,
      note,
      expires_at: expiresAt?.toISOString(),
    });
    return response.data;
  }

  async getFriendsStatus(): Promise<Status[]> {
    const response = await api.get("/status/friends");
    return response.data;
  }
}

export const statusService = new StatusService();
