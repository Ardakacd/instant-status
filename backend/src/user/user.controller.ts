import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
  NotFoundException,
} from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "../auth/auth.guard";
import { isUserPremium } from "../utils/premium";
import { z } from "zod";

const UpdateUserDtoSchema = z
  .object({
    email: z.string().email().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  })
  .strict(); // Reject unknown fields

@Controller("user")
export class UserController {
  constructor(private userService: UserService) {}

  @Get("me")
  @UseGuards(AuthGuard)
  async getMe(@Request() req) {
    // User comes from AuthGuard, so it's guaranteed to exist
    const user = await this.userService.findById(req.user.id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // premium_until is source of truth; is_premium is computed for API compat
    const isPremium = isUserPremium(user);

    const gracePeriodMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    const customStatusGracePeriodMs = 24 * 60 * 60 * 1000; // 24 hours

    let isInGracePeriod = false;
    let shouldResetCustomStatus = false;

    if (user.premium_until) {
      const expirationDate = new Date(user.premium_until);
      const now = new Date();
      isInGracePeriod =
        now >= expirationDate &&
        now < new Date(expirationDate.getTime() + gracePeriodMs);
      shouldResetCustomStatus =
        now >= new Date(expirationDate.getTime() + customStatusGracePeriodMs);
    }

    return {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_premium: isPremium,
      premium_until: user.premium_until,
      is_in_grace_period: isInGracePeriod,
      should_reset_custom_status: shouldResetCustomStatus,
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
      .strict() // Reject unknown fields
      .parse(body);

    const user = await this.userService.findByFirebaseUid(firebase_uid);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.userService.delete(user.id);
    return { message: "Account deleted successfully" };
  }
}
