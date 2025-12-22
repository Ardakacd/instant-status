import api from "../config/api";

export class InviteService {
  async generateCode(
    expiresInHours?: number
  ): Promise<{ code: string; expires_at: string | null }> {
    const response = await api.post("/invite-code", {
      expires_in_hours: expiresInHours,
    });
    return response.data;
  }

  async redeemCode(code: string): Promise<{ connection: any; owner: any }> {
    const response = await api.post("/invite-code/redeem", { code });
    return response.data;
  }

  async connectByLink(
    userId: string
  ): Promise<{ connection: any; owner: any }> {
    const response = await api.post("/invite-code/connect-by-link", {
      user_id: userId,
    });
    return response.data;
  }
}

export const inviteService = new InviteService();
