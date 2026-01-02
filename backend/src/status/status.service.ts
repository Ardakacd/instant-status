import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
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
    private userRepository: Repository<User>
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

      // Send push notifications to visible connections (don't fail if this fails)
      // Note: Firebase/Apple handle throttling on their end if notifications are sent too rapidly
      this.sendStatusUpdatePush(userId, state, note, expiresAt).catch(
        (error) => {
          this.logger.warn(
            `Failed to send push notifications for status update: ${error.message}`
          );
        }
      );

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

  /**
   * Checks if a status is expired and corrects it if needed.
   * Uses lazy evaluation - only checks expiration when status is accessed.
   */
  private checkAndCorrectExpiration(status: Status | null): Status | null {
    if (!status) return null;

    const now = new Date();
    if (status.expires_at && status.expires_at <= now) {
      // Status is expired - correct it
      status.state = StatusState.OFFLINE;
      status.expires_at = null;
      status.note = null;
      // Persist the correction (fire and forget to avoid blocking)
      this.statusRepository
        .update(
          { user_id: status.user_id },
          { state: StatusState.OFFLINE, expires_at: null, note: null }
        )
        .catch((error) => {
          this.logger.warn(
            `Failed to persist expired status correction: ${error.message}`
          );
        });
    }

    return status;
  }

  /**
   * Checks and corrects multiple expired statuses in bulk.
   * Uses PostgreSQL NOW() for accurate timezone-aware comparison.
   * More efficient than checking individually.
   */
  private async checkAndCorrectExpiredStatuses(
    userIds: string[]
  ): Promise<void> {
    if (userIds.length === 0) return;

    try {
      // Use PostgreSQL NOW() to compare timestamps correctly across timezones
      await this.statusRepository
        .createQueryBuilder()
        .update(Status)
        .set({
          state: StatusState.OFFLINE,
          expires_at: null,
          note: null,
        })
        .where("user_id IN (:...userIds)", { userIds })
        .andWhere("expires_at IS NOT NULL")
        .andWhere("expires_at <= NOW()")
        .execute();
    } catch (error: any) {
      this.logger.warn(
        `Failed to bulk correct expired statuses: ${error.message}`
      );
      // Don't throw - this is a background correction
    }
  }

  async getUserStatus(userId: string) {
    try {
      const status = await this.statusRepository.findOne({
        where: { user_id: userId },
      });

      // Apply lazy expiration check
      return this.checkAndCorrectExpiration(status);
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
      const friendConnections = connections
        .map((conn) => {
          const friend = conn.user_id === userId ? conn.friend : conn.user;
          // Skip if friend is null (user was deleted but connection still exists)
          if (!friend) {
            return null;
          }
          const isVisible = conn.a_shows_status && conn.b_shows_status;
          return {
            friendId: friend.id,
            friend: friend,
            visibility: isVisible,
          };
        })
        .filter((fc): fc is NonNullable<typeof fc> => fc !== null);

      const friendIds = friendConnections.map((fc) => fc.friendId);

      // Check and correct expired statuses in bulk before fetching
      await this.checkAndCorrectExpiredStatuses(friendIds);

      // Get statuses for all friends
      const statuses = await this.statusRepository.find({
        where: friendIds.map((id) => ({ user_id: id })),
        relations: ["user"],
      });

      // Create a map of friendId -> status for quick lookup
      // Filter out statuses where user is null (user was deleted but status still exists)
      const statusMap = new Map(
        statuses
          .filter((status) => status.user !== null)
          .map((status) => [status.user_id, status])
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

        // Apply lazy expiration check (status should already be corrected by bulk update,
        // but check again to be safe)
        const correctedStatus = this.checkAndCorrectExpiration(status);

        // Return actual status (or OFFLINE if expired)
        // NestJS automatically serializes Date objects to ISO strings via JSON.stringify()
        return {
          user_id: correctedStatus.user_id,
          first_name: correctedStatus.user.first_name,
          last_name: correctedStatus.user.last_name,
          avatar_url: null, // TODO: Add avatar_url to User entity if needed
          state: correctedStatus.state,
          note: correctedStatus.note,
          expires_at: correctedStatus.expires_at,
          updated_at: correctedStatus.updated_at,
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
    note?: string,
    expiresAt?: Date
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

      // Include the user's own devices for multi-device sync
      // This ensures widgets update on all user's devices (iPad, iPhone, etc.)
      const allUserIds = [...new Set([...connectionUserIds, userId])];

      if (allUserIds.length === 0) return;

      // Get device tokens for all users (friends + self) using In operator for performance
      const deviceTokens = await this.deviceTokenRepository.find({
        where: { user_id: In(allUserIds) },
      });

      console.log("Device tokens:", deviceTokens);

      if (deviceTokens.length === 0) return;

      // Prepare display name
      const displayName =
        user.first_name && user.last_name
          ? `${user.first_name} ${user.last_name}`
          : user.first_name || user.last_name || "Someone";

      // Prepare notification title and body
      const statusEmoji: Record<StatusState, string> = {
        FREE: "🟢",
        BUSY: "🔴",
        DND: "🔴",
        SLEEP: "🟡",
        OFFLINE: "⚪",
      };

      const statusText: Record<StatusState, string> = {
        FREE: "is free",
        BUSY: "is busy",
        DND: "is busy (do not disturb)",
        SLEEP: "is sleeping",
        OFFLINE: "is offline",
      };

      const title = `${displayName} ${statusText[state]}`;
      // Truncate note to prevent payload size issues (FCM limit: 4KB, iOS widgets have tiny memory)
      const truncatedNote = note ? note.substring(0, 200) : "";
      // Body is only included if there's a note - mobile app will format expiration using user's locale
      const body = truncatedNote || undefined;

      // Prepare timestamp for widget freshness check
      const timestamp = new Date().toISOString();

      // Determine notification priority based on expiration duration
      // For statuses expiring in under 5 minutes, use normal priority to reduce battery/system cost
      const MIN_DURATION_FOR_HIGH_PRIORITY_MS = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();
      const isShortDuration =
        expiresAt &&
        expiresAt.getTime() - now < MIN_DURATION_FOR_HIGH_PRIORITY_MS;

      // Use normal priority for short durations, high priority otherwise
      const androidPriority = isShortDuration
        ? ("normal" as const)
        : ("high" as const);
      const apnsPriority = isShortDuration ? "5" : "10";

      // Prepare common data payload
      const commonData = {
        type: "status_update", // Matches what index.ts background handler expects
        user_id: userId,
        display_name: displayName,
        state,
        note: truncatedNote || "",
        expires_at: expiresAt ? expiresAt.toISOString() : "",
        timestamp, // Allows widget to detect stale data
      };

      // Split device tokens: user's own devices vs friends' devices
      const ownDeviceTokens = deviceTokens.filter(
        (token) => token.user_id === userId
      );
      const friendDeviceTokens = deviceTokens.filter(
        (token) => token.user_id !== userId
      );

      // Build messages array and map tokens to device token IDs for error handling
      const messages: any[] = [];
      const tokenToIdMap = new Map<string, string>(); // Maps FCM token -> device token ID

      // For user's own devices: send data-only messages (silent, for widget sync)
      // No visible notification since user already knows their own status
      for (const token of ownDeviceTokens) {
        tokenToIdMap.set(token.token, token.id);
        messages.push({
          token: token.token,
          data: commonData,
          android: {
            priority: androidPriority,
            // No notification object = silent data-only message
          },
          apns: {
            headers: {
              "apns-priority": apnsPriority,
              "apns-push-type": "background", // Background push for data-only
            },
            payload: {
              aps: {
                "content-available": 1, // Wakes app in background for widget updates
                // No sound, badge, or alert = silent
              },
            },
          },
        });
      }

      // For friends' devices: send visible notifications
      for (const token of friendDeviceTokens) {
        tokenToIdMap.set(token.token, token.id);
        messages.push({
          token: token.token,
          notification: {
            title,
            ...(body && { body }), // Only include body if it exists
          },
          data: commonData,
          android: {
            priority: androidPriority,
            notification: {
              sound: "default",
              channelId: "default",
            },
          },
          apns: {
            headers: {
              "apns-priority": apnsPriority,
              "apns-push-type": "alert", // Required for visible notifications
            },
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                "mutable-content": 1, // Allows Notification Service Extension to update widget
                "content-available": 1, // Wakes app in background for widget updates
              },
            },
          },
        });
      }

      console.log("Sending push notifications to:", allUserIds);
      console.log("Messages:", messages);

      try {
        const response = await this.firebaseAdmin
          .messaging()
          .sendEach(messages);

        this.logger.log(
          `Sent ${response.successCount}/${messages.length} push notifications`
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
                `Failed to send notification: ${errorCode} - ${result.error.message} (token: ${message.token.substring(0, 20)}...)`
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
                `Deleted ${invalidTokenIds.length} invalid device token(s)`
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
          `Error sending push notifications: ${error.message}`,
          error.stack
        );
        // Push notification failures shouldn't fail status updates
      }
    } catch (error: any) {
      this.logger.error(
        `Error preparing status update push: ${error.message}`,
        error.stack
      );
    }
  }
}
