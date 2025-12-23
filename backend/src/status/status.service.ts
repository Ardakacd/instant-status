import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Repository } from "typeorm";
import { Queue } from "bullmq";
import { Status, StatusState } from "../entities/status.entity";
import { Connection } from "../entities/connection.entity";
import { DeviceToken } from "../entities/device-token.entity";
import { User } from "../entities/user.entity";
import * as admin from "firebase-admin";
import { getFirebaseAdmin } from "../config/firebase-admin.config";

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private firebaseAdmin: admin.app.App;

  constructor(
    @InjectRepository(Status)
    private statusRepository: Repository<Status>,
    @InjectRepository(Connection)
    private connectionRepository: Repository<Connection>,
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectQueue("status-expiration")
    private statusExpirationQueue: Queue
  ) {
    this.firebaseAdmin = getFirebaseAdmin();
  }

  async updateStatus(
    userId: string,
    state: StatusState,
    note?: string,
    expiresAt?: Date
  ) {
    try {
      // Validate note length
      if (note && note.length > 200) {
        throw new BadRequestException("Note cannot exceed 200 characters");
      }

      // Validate expiresAt is in the future
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException("Expiration time must be in the future");
      }

      let status = await this.statusRepository.findOne({
        where: { user_id: userId },
      });

      if (!status) {
        status = this.statusRepository.create({
          user_id: userId,
          state,
          note: note || null,
          expires_at: expiresAt || null,
        });
      } else {
        status.state = state;
        status.note = note || null;
        status.expires_at = expiresAt || null;
      }

      const savedStatus = await this.statusRepository.save(status);

      // Schedule expiration job if expires_at is set
      if (expiresAt) {
        const delay = expiresAt.getTime() - Date.now();
        if (delay > 0) {
          await this.statusExpirationQueue.add(
            "expire-status",
            { userId, statusId: savedStatus.user_id },
            { delay }
          );
        }
      }

      // Send push notifications to visible connections (don't fail if this fails)
      this.sendStatusUpdatePush(userId, state, note).catch((error) => {
        this.logger.warn(
          `Failed to send push notifications for status update: ${error.message}`
        );
      });

      return savedStatus;
    } catch (error: any) {
      // Re-throw NestJS exceptions as-is
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(`Error updating status: ${error.message}`, error.stack);
      throw new InternalServerErrorException("Failed to update status");
    }
  }

  async getUserStatus(userId: string) {
    try {
      return await this.statusRepository.findOne({
        where: { user_id: userId },
      });
    } catch (error: any) {
      this.logger.error(
        `Error getting user status: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to get user status");
    }
  }

  async getFriendsStatus(userId: string) {
    try {
      // Get all connections where user is involved (regardless of visibility)
      const connections = await this.connectionRepository.find({
        where: [
          {
            user_id: userId,
          },
          {
            friend_id: userId,
          },
        ],
        relations: ["user", "friend"],
      });

      if (connections.length === 0) {
        return [];
      }

      // Map connections to friend info with visibility flag
      // Status is visible only if BOTH sides allow it: a_shows_status && b_shows_status
      const friendConnections = connections.map((conn) => {
        const friend = conn.user_id === userId ? conn.friend : conn.user;
        const isVisible = conn.a_shows_status && conn.b_shows_status;
        return {
          friendId: friend.id,
          friend: friend,
          visibility: isVisible,
        };
      });

      const friendIds = friendConnections.map((fc) => fc.friendId);

      // Get statuses for all friends
      const statuses = await this.statusRepository.find({
        where: friendIds.map((id) => ({ user_id: id })),
        relations: ["user"],
      });

      // Create a map of friendId -> status for quick lookup
      const statusMap = new Map(
        statuses.map((status) => [status.user_id, status])
      );

      // Return status for each friend connection
      // If visibility is false, return OFFLINE status
      return friendConnections.map((fc) => {
        const status = statusMap.get(fc.friendId);

        // If visibility is false, return OFFLINE status
        if (!fc.visibility) {
          return {
            user_id: fc.friendId,
            first_name: fc.friend.first_name,
            last_name: fc.friend.last_name,
            avatar_url: null, // TODO: Add avatar_url to User entity if needed
            state: StatusState.OFFLINE,
            note: null,
            expires_at: null,
            updated_at: new Date().toISOString(),
          };
        }

        // If visibility is true but no status exists, return OFFLINE
        if (!status) {
          return {
            user_id: fc.friendId,
            first_name: fc.friend.first_name,
            last_name: fc.friend.last_name,
            avatar_url: null,
            state: StatusState.OFFLINE,
            note: null,
            expires_at: null,
            updated_at: new Date().toISOString(),
          };
        }

        // Return actual status
        return {
          user_id: status.user_id,
          first_name: status.user.first_name,
          last_name: status.user.last_name,
          avatar_url: null, // TODO: Add avatar_url to User entity if needed
          state: status.state,
          note: status.note,
          expires_at: status.expires_at,
          updated_at: status.updated_at,
        };
      });
    } catch (error: any) {
      this.logger.error(
        `Error getting friends status: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to get friends status");
    }
  }

  private async sendStatusUpdatePush(
    userId: string,
    state: StatusState,
    note?: string
  ) {
    try {
      // Get user info
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) return;

      // Find all connections where this user is involved
      // We'll filter by visibility (a_shows_status && b_shows_status) after fetching
      const connections = await this.connectionRepository.find({
        where: [
          {
            user_id: userId,
          },
          {
            friend_id: userId,
          },
        ],
      });

      // Filter to only connections where BOTH sides allow visibility
      const visibleConnections = connections.filter(
        (conn) => conn.a_shows_status && conn.b_shows_status
      );

      const connectionUserIds = visibleConnections.map((conn) =>
        conn.user_id === userId ? conn.friend_id : conn.user_id
      );

      if (connectionUserIds.length === 0) return;

      // Get device tokens for all connected users
      const deviceTokens = await this.deviceTokenRepository.find({
        where: connectionUserIds.map((id) => ({ user_id: id })),
      });

      if (deviceTokens.length === 0) return;

      // Send FCM messages
      const messages = deviceTokens.map((token) => ({
        token: token.token,
        data: {
          type: "status_update",
          user_id: userId,
          display_name:
            user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.first_name || user.last_name || "",
          state,
          note: note || "",
        },
        android: {
          priority: "high" as const,
        },
        apns: {
          headers: {
            "apns-priority": "10",
          },
        },
      }));

      try {
        const response = await this.firebaseAdmin
          .messaging()
          .sendEach(messages);
        this.logger.log(
          `Sent ${response.successCount}/${messages.length} push notifications`
        );
        if (response.failureCount > 0) {
          this.logger.warn(
            `Failed to send ${response.failureCount} push notifications`
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Error sending push notifications: ${error.message}`,
          error.stack
        );
        // Don't throw - push notification failures shouldn't fail status updates
      }
    } catch (error: any) {
      this.logger.error(
        `Error preparing status update push: ${error.message}`,
        error.stack
      );
      // Don't throw - push notification failures shouldn't fail status updates
    }
  }
}
