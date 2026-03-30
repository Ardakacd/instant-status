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
import { Throttle } from "@nestjs/throttler";
import { UserService } from "./user.service";
import { AuthGuard } from "../auth/auth.guard";
import { computePremiumGraceFlags, isUserPremium } from "../utils/premium";
import { z } from "zod";

const UpdateUserDtoSchema = z
  .object({
    // min(1) after trim() rejects empty strings and whitespace-only values
    first_name: z.string().trim().min(1).max(50).optional(),
    last_name: z.string().trim().min(1).max(50).optional(),
  })
  .strict(); // Reject unknown fields

@Controller("user")
export class UserController {
  constructor(private userService: UserService) {}

  @Get("me")
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 reads/min
  async getMe(@Request() req) {
    // User comes from AuthGuard, so it's guaranteed to exist
    const user = await this.userService.findById(req.user.id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // premium_until is source of truth; is_premium is computed for API compat
    const isPremium = isUserPremium(user);
    const { is_in_grace_period, should_reset_custom_status } =
      computePremiumGraceFlags(user);

    return {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_premium: isPremium,
      premium_until: user.premium_until,
      is_in_grace_period,
      should_reset_custom_status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  @Patch("me")
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 updates/min
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
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 deletes/min
  async deleteMe(@Request() req) {
    await this.userService.delete(req.user.id);
    return { message: "Account deleted successfully" };
  }

}
