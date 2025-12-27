import api from "../config/api";
import { Connection } from "../types";

export class ConnectionsService {
  async getConnections(): Promise<Connection[]> {
    const response = await api.get("/connections");
    return response.data;
  }

  async deleteConnection(friendId: string): Promise<void> {
    await api.delete(`/connections/${friendId}`);
  }

  async updateVisibility(
    friendId: string,
    showsStatus: boolean
  ): Promise<void> {
    await api.patch(`/connections/${friendId}/visibility`, {
      shows_status: showsStatus,
    });
  }
}

export const connectionsService = new ConnectionsService();
