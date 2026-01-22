import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository, In } from "typeorm";
import { Connection } from "../entities/connection.entity";
import { DeviceToken } from "../entities/device-token.entity";
import { User } from "../entities/user.entity";
import * as admin from "firebase-admin";
import { getFirebaseAdmin } from "../config/firebase-admin.config";

/**
 * Normalizes a user pair to ensure consistent ordering.
 * Always returns [smaller_id, larger_id] for stable storage.
 * This prevents duplicate connections (A-B vs B-A).
 */
function normalizePair(userId: string, friendId: string): [string, string] {
  return userId < friendId ? [userId, friendId] : [friendId, userId];
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private firebaseAdmin: admin.app.App;

  constructor(
    @InjectRepository(Connection)
    private connectionRepository: Repository<Connection>,
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {
    this.firebaseAdmin = getFirebaseAdmin();
  }

  async findAll(userId: string) {
    try {
      // Query both positions since we store normalized pairs
      const connections = await this.connectionRepository.find({
        where: [{ user_id: userId }, { friend_id: userId }],
        relations: ["user", "friend"],
      });

      return connections;
    } catch (error: any) {
      this.logger.error(
        `Error finding connections: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to find connections");
    }
  }

  /**
   * Removes a connection between two users.
   * Since we use normalized pairs, removing the connection removes it from both sides.
   */
  async delete(userId: string, friendId: string) {
    try {
      const [a, b] = normalizePair(userId, friendId);
      const connection = await this.connectionRepository.findOne({
        where: { user_id: a, friend_id: b },
      });

      if (!connection) {
        throw new NotFoundException("Connection not found");
      }

      await this.connectionRepository.remove(connection);
    } catch (error: any) {
      // Re-throw NotFoundException as-is
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error deleting connection: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to delete connection");
    }
  }

  /**
   * Updates visibility for a specific user.
   * Since we store normalized pairs (a < b), we need to determine
   * which field to update based on which user is making the request.
   */
  async updateVisibility(
    userId: string,
    friendId: string,
    showsStatus: boolean
  ) {
    try {
      const [a, b] = normalizePair(userId, friendId);
      const connection = await this.connectionRepository.findOne({
        where: { user_id: a, friend_id: b },
      });

      if (!connection) {
        throw new NotFoundException("Connection not found");
      }

      // Determine which field to update based on which user is making the request
      if (userId === a) {
        connection.a_shows_status = showsStatus;
      } else {
        connection.b_shows_status = showsStatus;
      }

      return await this.connectionRepository.save(connection);
    } catch (error: any) {
      // Re-throw NotFoundException as-is
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error updating visibility: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to update visibility");
    }
  }

  /**
   * Checks if status is visible between two users.
   * Status is visible only if BOTH sides allow it: a_shows_status && b_shows_status
   */
  isStatusVisible(connection: Connection): boolean {
    return connection.a_shows_status && connection.b_shows_status;
  }

  /**
   * Gets the visibility state for a specific user in a connection.
   * Returns whether the requesting user has visibility enabled.
   */
  getUserVisibilityState(connection: Connection, userId: string): boolean {
    const [a, _] = normalizePair(connection.user_id, connection.friend_id);
    return userId === a ? connection.a_shows_status : connection.b_shows_status;
  }

  /**
   * Find a connection between two users (if it exists)
   * Returns the connection or null if not found
   */
  async findConnection(
    userId: string,
    friendId: string
  ): Promise<Connection | null> {
    const [a, b] = normalizePair(userId, friendId);
    return await this.connectionRepository.findOne({
      where: { user_id: a, friend_id: b },
    });
  }

  async createFromInvite(
    userId: string,
    friendId: string,
    manager?: EntityManager
  ) {
    if (userId === friendId) {
      throw new BadRequestException("Cannot connect to yourself");
    }

    // Normalize pair to ensure consistent ordering
    const [a, b] = normalizePair(userId, friendId);

    // Use transaction manager if provided, otherwise use repository
    const repo = manager
      ? manager.getRepository(Connection)
      : this.connectionRepository;

    try {
      // Check if connection already exists (using normalized pair)
      const existing = await repo.findOne({
        where: { user_id: a, friend_id: b },
      });

      if (existing) {
        return existing;
      }

      // Create new connection with normalized pair
      // Both users start with visibility enabled by default
      const connection = repo.create({
        user_id: a,
        friend_id: b,
        a_shows_status: true,
        b_shows_status: true,
      });

      const savedConnection = await repo.save(connection);

      // Send push notification to the friend (the one who didn't initiate the connection)
      // Determine which user is the friend (the one receiving the notification)
      const friendUserId = userId === a ? b : a;
      // Don't await - fire and forget to avoid blocking the response
      this.sendFriendAddedPush(userId, friendUserId).catch((error) => {
        this.logger.error(
          `Failed to send friend added notification: ${error.message}`,
          error.stack
        );
      });

      return savedConnection;
    } catch (err: any) {
      // Handle unique constraint violation (race condition)
      // Another request created the connection between our check and save
      if (err.code === "23505") {
        const existing = await repo.findOne({
          where: { user_id: a, friend_id: b },
        });
        if (!existing) {
          this.logger.error(
            `Unique constraint violation but connection not found: ${err.message}`
          );
          throw new InternalServerErrorException("Failed to create connection");
        }
        return existing;
      }
      this.logger.error(`Error creating connection: ${err.message}`, err.stack);
      throw new InternalServerErrorException("Failed to create connection");
    }
  }

  private async sendFriendAddedPush(
    requesterUserId: string,
    friendUserId: string
  ) {
    try {
      // Get requester user info (the one who added the friend)
      const requesterUser = await this.userRepository.findOne({
        where: { id: requesterUserId },
      });
      if (!requesterUser) return;

      // Get device tokens for the friend (the one receiving the notification)
      const deviceTokens = await this.deviceTokenRepository.find({
        where: { user_id: friendUserId },
      });

      if (deviceTokens.length === 0) return;

      // Prepare display name
      const displayName =
        requesterUser.first_name && requesterUser.last_name
          ? `${requesterUser.first_name} ${requesterUser.last_name}`
          : requesterUser.first_name || requesterUser.last_name || "Someone";

      const title = `${displayName} added you as a friend`;

      // Prepare timestamp
      const timestamp = new Date().toISOString();

      // Build messages array and map tokens to device token IDs for error handling
      const messages: any[] = [];
      const tokenToIdMap = new Map<string, string>(); // Maps FCM token -> device token ID

      for (const token of deviceTokens) {
        tokenToIdMap.set(token.token, token.id);
        messages.push({
          token: token.token,
          notification: {
            title,
          },
          data: {
            type: "friend_added",
            requester_user_id: requesterUserId,
            display_name: displayName,
            timestamp,
          },
          android: {
            priority: "high" as const,
            notification: {
              sound: "default",
              channelId: "default",
            },
          },
          apns: {
            headers: {
              "apns-priority": "10",
              "apns-push-type": "alert",
            },
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        });
      }

      this.logger.log(
        `Sending friend added push notifications to user ${friendUserId}`
      );

      try {
        const response = await this.firebaseAdmin
          .messaging()
          .sendEach(messages);
        this.logger.log(
          `Sent ${response.successCount}/${messages.length} friend added push notifications`
        );
        if (response.failureCount > 0) {
          // Track invalid token IDs to delete
          const invalidTokenIds: string[] = [];

          // Log failed messages and identify invalid tokens
          response.responses.forEach((result, index) => {
            if (!result.success && result.error) {
              const message = messages[index];
              const errorCode = result.error.code;

              this.logger.warn(
                `Failed to send friend added notification: ${errorCode} - ${result.error.message} (token: ${message.token.substring(0, 20)}...)`
              );

              // Delete tokens for these error codes (invalid/expired tokens)
              if (
                errorCode === "messaging/invalid-registration-token" ||
                errorCode === "messaging/registration-token-not-registered" ||
                errorCode === "messaging/invalid-argument" ||
                errorCode === "messaging/third-party-auth-error"
              ) {
                const deviceTokenId = tokenToIdMap.get(message.token);
                if (deviceTokenId) {
                  invalidTokenIds.push(deviceTokenId);
                }
              }
            }
          });

          // Delete invalid tokens from database
          if (invalidTokenIds.length > 0) {
            try {
              await this.deviceTokenRepository.delete({
                id: In(invalidTokenIds),
              });
              this.logger.log(
                `Deleted ${invalidTokenIds.length} invalid device token(s) from friend added notifications`
              );
            } catch (deleteError: any) {
              this.logger.error(
                `Failed to delete invalid tokens: ${deleteError.message}`
              );
            }
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Error sending friend added push notifications: ${error.message}`,
          error.stack
        );
        // Push notification failures shouldn't fail connection creation
      }
    } catch (error: any) {
      this.logger.error(
        `Error preparing friend added push: ${error.message}`,
        error.stack
      );
    }
  }
}
