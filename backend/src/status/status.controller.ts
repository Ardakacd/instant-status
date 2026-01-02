import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from "@nestjs/common";
import { StatusService } from "./status.service";
import { AuthGuard } from "../auth/auth.guard";
import { StatusState } from "../entities/status.entity";
import { z } from "zod";

const UpdateStatusDtoSchema = z.object({
  state: z.nativeEnum(StatusState),
  note: z.string().optional(),
  expires_at: z.string().datetime().optional(),
});

@Controller("status")
@UseGuards(AuthGuard)
export class StatusController {
  constructor(private statusService: StatusService) {}

  @Patch()
  async updateStatus(@Request() req, @Body() body: unknown) {
    const { state, note, expires_at } = UpdateStatusDtoSchema.parse(body);

    // Validate expires_at is a valid ISO 8601 date string with timezone info if provided
    let expiresAt: Date | undefined;
    if (expires_at) {
      expiresAt = new Date(expires_at);
      if (isNaN(expiresAt.getTime())) {
        throw new BadRequestException("Invalid expiration date format");
      }
    }

    const status = await this.statusService.updateStatus(
      req.user.id,
      state,
      note,
      expiresAt
    );

    return {
      user_id: status.user_id,
      state: status.state,
      note: status.note,
      // NestJS automatically serializes Date objects to ISO strings via JSON.stringify()
      expires_at: status.expires_at,
      updated_at: status.updated_at,
    };
  }

  @Get("me")
  async getMyStatus(@Request() req) {
    const status = await this.statusService.getUserStatus(req.user.id);
    if (!status) {
      return {
        user_id: req.user.id,
        state: StatusState.OFFLINE,
        note: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      };
    }
    return {
      user_id: status.user_id,
      state: status.state,
      note: status.note,
      // NestJS automatically serializes Date objects to ISO strings via JSON.stringify()
      expires_at: status.expires_at,
      updated_at: status.updated_at,
    };
  }

  @Get("friends")
  async getFriendsStatus(@Request() req) {
    return this.statusService.getFriendsStatus(req.user.id);
  }
}
