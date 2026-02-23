import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { StatusService } from "./status.service";
import { StatusOptionService } from "../status-option/status-option.service";
import { AuthGuard } from "../auth/auth.guard";
import { z } from "zod";

const UpdateStatusDtoSchema = z
  .object({
    option_id: z.string().uuid(),
    note: z.string().optional(),
    expires_at: z.string().datetime().optional(),
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
  async getFriendsStatus(@Request() req) {
    return this.statusService.getFriendsStatus(req.user.id);
  }
}
