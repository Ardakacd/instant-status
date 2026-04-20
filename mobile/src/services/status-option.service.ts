import api from "../config/api";

export interface StatusOption {
  id: string;
  user_id: string | null;
  label: string;
  emoji: string;
  color: string;
  sort_order: number;
}

export class StatusOptionService {
  async getStatusOptions(): Promise<StatusOption[]> {
    const response = await api.get("/status-options");
    return response.data;
  }

  async getStatusOptionById(id: string): Promise<StatusOption> {
    const response = await api.get(`/status-options/${id}`);
    return response.data;
  }

  async createStatusOption(data: {
    label: string;
    emoji: string;
    color: string;
    sort_order?: number;
  }): Promise<StatusOption> {
    const response = await api.post("/status-options", data);
    return response.data;
  }

  async updateStatusOption(
    id: string,
    data: {
      label?: string;
      emoji?: string;
      color?: string;
      sort_order?: number;
    },
  ): Promise<StatusOption> {
    const response = await api.patch(`/status-options/${id}`, data);
    return response.data;
  }

  async deleteStatusOption(id: string): Promise<void> {
    await api.delete(`/status-options/${id}`);
  }
}

export const statusOptionService = new StatusOptionService();
