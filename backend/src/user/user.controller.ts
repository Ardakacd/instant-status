import {
  Controller,
  Get,
  Patch,
  Delete,
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
export class UserController {
  constructor(private userService: UserService) {}

  @Get("me")
  @UseGuards(AuthGuard)
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
  @UseGuards(AuthGuard)
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

  @Delete("me")
  @UseGuards(AuthGuard)
  async deleteMe(@Request() req) {
    await this.userService.delete(req.user.id);
    return { message: "Account deleted successfully" };
  }

  @Delete("by-firebase-uid")
  async deleteByFirebaseUid(@Body() body: unknown) {
    const { firebase_uid } = z
      .object({
        firebase_uid: z.string(),
      })
      .parse(body);

    const user = await this.userService.findByFirebaseUid(firebase_uid);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    await this.userService.delete(user.id);
    return { message: "Account deleted successfully" };
  }
}
