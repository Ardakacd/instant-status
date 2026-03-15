import {
  Controller,
  Get,
  Delete,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConnectionsService } from "./connections.service";
import { AuthGuard } from "../auth/auth.guard";
import { UserService } from "../user/user.service";
import { z } from "zod";

const FriendIdParamSchema = z.string().uuid();

const FromInviteDtoSchema = z
  .object({
    friend_id: z.string().uuid(),
  })
  .strict(); // Reject unknown fields

@Controller("connections")
@UseGuards(AuthGuard)
export class ConnectionsController {
  constructor(
    private connectionsService: ConnectionsService,
    private userService: UserService
  ) {}

  @Get()
  async getConnections(@Request() req) {
    const connections = await this.connectionsService.findAll(req.user.id);

    return connections.map((conn) => {
      const friend = conn.user_id === req.user.id ? conn.friend : conn.user;
      const isVisible = this.connectionsService.isStatusVisible(conn);
      const userShowsStatus = this.connectionsService.getUserVisibilityState(
        conn,
        req.user.id
      );

      return {
        id: conn.id,
        friend_id: friend.id,
        friend_first_name: friend.first_name,
        friend_last_name: friend.last_name,
        friend_avatar_url: null, // TODO: Add avatar_url to User entity if needed
        visibility: isVisible, // Combined visibility (both must be true)
        user_shows_status: userShowsStatus, // This user's visibility setting
        created_at: conn.created_at,
      };
    });
  }

  @Get("friend-count")
  async getFriendCount(@Request() req) {
    const limitCheck = await this.connectionsService.checkFriendLimit(req.user.id);
    
    return {
      count: limitCheck.currentCount,
      limit: limitCheck.limit,
      freeLimit: limitCheck.freeLimit,
      canAddMore: limitCheck.canAdd,
      isGrandfathered: limitCheck.isGrandfathered || false,
      errorMessage: limitCheck.errorMessage,
    };
  }

  @Delete(":friend_id")
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 removals/min
  async deleteConnection(@Request() req, @Param("friend_id") rawFriendId: string) {
    const friendId = FriendIdParamSchema.parse(rawFriendId);
    await this.connectionsService.delete(req.user.id, friendId);
    return { message: "Connection removed" };
  }

  @Patch(":friend_id/visibility")
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 toggles/min
  async updateVisibility(
    @Request() req,
    @Param("friend_id") rawFriendId: string,
    @Body() body: unknown
  ) {
    const friendId = FriendIdParamSchema.parse(rawFriendId);
    const { shows_status } = z
      .object({ shows_status: z.boolean() })
      .strict() // Reject unknown fields
      .parse(body);
    await this.connectionsService.updateVisibility(
      req.user.id,
      friendId,
      shows_status
    );
    return { message: "Visibility updated" };
  }

  @Post("from-invite")
  async createFromInvite(@Request() req, @Body() body: unknown) {
    const { friend_id } = FromInviteDtoSchema.parse(body);
    const connection = await this.connectionsService.createFromInvite(
      req.user.id,
      friend_id
    );
    return {
      id: connection.id,
      friend_id: connection.friend_id,
      friend_display_name:
        connection.friend.first_name && connection.friend.last_name
          ? `${connection.friend.first_name} ${connection.friend.last_name}`
          : connection.friend.first_name || connection.friend.last_name || null,
      visibility: connection.a_shows_status && connection.b_shows_status,
    };
  }
}
