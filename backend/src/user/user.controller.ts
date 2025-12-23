import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "../auth/auth.guard";
import { z } from "zod";

const UpdateUserDtoSchema = z.object({
  email: z.string().email().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

@Controller("user")
@UseGuards(AuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get("me")
  async getMe(@Request() req) {
    // User comes from AuthGuard, so it's guaranteed to exist
    const user = await this.userService.findById(req.user.id);

    if (!user) {
      // This shouldn't happen, but handle it gracefully
      throw new UnauthorizedException("User not found");
    }

    return {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  @Patch("me")
  async updateMe(@Request() req, @Body() body: unknown) {
    const data = UpdateUserDtoSchema.parse(body);
    const user = await this.userService.update(req.user.id, data);
    return {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      updated_at: user.updated_at,
    };
  }
}
