import api from "../config/api";
import { User } from "../types";

export class UserService {
  async getMe(): Promise<User> {
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
}

export const userService = new UserService();
