import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { StatusService } from "./status.service";
import { StatusOptionService } from "../status-option/status-option.service";
import { AuthGuard } from "../auth/auth.guard";
import { z } from "zod";

const MAX_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const UpdateStatusDtoSchema = z
  .object({
    option_id: z.string().uuid(),
    note: z.string().max(200).optional(),
    expires_at: z
      .string()
      .datetime()
      .optional()
      .refine(
        (val) => {
          if (val === undefined) return true;
          const ts = new Date(val).getTime();
          const now = Date.now();
          return ts > now && ts <= now + MAX_EXPIRATION_MS;
        },
        { message: "Expiration must be in the future and within 30 days" },
      ),
  })
  .strict(); // Reject unknown fields

@Controller("status")
@UseGuards(AuthGuard)
export class StatusController {
  constructor(
    private statusService: StatusService,
    private statusOptionService: StatusOptionService,
  ) {}

  @Patch()
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 updates/min per user
  async updateStatus(@Request() req, @Body() body: unknown) {
    const { option_id, note, expires_at } = UpdateStatusDtoSchema.parse(body);

    // Zod's .datetime() already validates ISO 8601 format, so new Date() will always be valid
    const expiresAt = expires_at ? new Date(expires_at) : undefined;

    // Prepare display name from req.user to avoid extra database query in service
    const displayName =
      req.user.first_name && req.user.last_name
        ? `${req.user.first_name} ${req.user.last_name}`
        : req.user.first_name || req.user.last_name || "Someone";

    const { status, option } = await this.statusService.updateStatus(
      req.user.id,
      option_id,
      displayName,
      note,
      expiresAt,
    );

    return {
      user_id: status.user_id,
      option: {
        id: option.id,
        label: option.label,
        emoji: option.emoji,
        color: option.color,
      },
      note: status.note,
      expires_at: status.expires_at?.toISOString() ?? null,
      updated_at: status.updated_at.toISOString(),
    };
  }

  @Get("me")
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 reads/min
  async getMyStatus(@Request() req) {
    const status = await this.statusService.getUserStatus(req.user.id);

    if (!status) {
      // Only fetch default option if status doesn't exist
      const defaultOption =
        await this.statusOptionService.getDefaultStatusOption();
      return {
        user_id: req.user.id,
        option: defaultOption
          ? {
              id: defaultOption.id,
              label: defaultOption.label,
              emoji: defaultOption.emoji,
              color: defaultOption.color,
            }
          : null,
        note: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      };
    }

    // Status already has option relation loaded, no need to fetch default
    return {
      user_id: status.user_id,
      option: status.option
        ? {
            id: status.option.id,
            label: status.option.label,
            emoji: status.option.emoji,
            color: status.option.color,
          }
        : null,
      note: status.note,
      expires_at: status.expires_at?.toISOString() ?? null,
      updated_at: status.updated_at.toISOString(),
    };
  }

  @Get("friends")
  @Throttle({ default: { limit: 120, ttl: 60000 } }) // 120 reads/min (widget + home + push can stack)
  async getFriendsStatus(@Request() req) {
    return this.statusService.getFriendsStatus(req.user.id);
  }
}
