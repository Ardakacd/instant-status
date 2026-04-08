import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { Status } from "../entities/status.entity";
import { StatusOption } from "../entities/status-option.entity";
import { Connection } from "../entities/connection.entity";
import { DeviceToken, Platform } from "../entities/device-token.entity";
import { User } from "../entities/user.entity";
import { StatusOptionService } from "../status-option/status-option.service";
import * as admin from "firebase-admin";
import { getFirebaseAdmin } from "../config/firebase-admin.config";
import { redactUid } from "../utils/redact";
import { sendEachAndCleanup } from "../utils/fcm";
import { isUserPremium, computePremiumGraceFlags } from "../utils/premium";

@Injectable()
export class StatusService {
  private readonly logger = new StructuredLogger(StatusService.name);
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
    private statusOptionService: StatusOptionService,
  ) {
    this.firebaseAdmin = getFirebaseAdmin();
  }

  async updateStatus(
    userId: string,
    optionId: string,
    displayName: string,
    note?: string,
    expiresAt?: Date,
  ): Promise<{ status: Status; option: StatusOption }> {
    try {
      // Validate that the option exists and user has access to it
      const option = await this.statusOptionService.getStatusOptionById(
        optionId,
        userId,
      );

      // Check if user is trying to use a custom status without premium
      // Custom statuses have user_id !== null
      if (option.user_id !== null) {
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });

        if (!user) {
          throw new InternalServerErrorException("User not found");
        }

        const isPremium = isUserPremium(user);
        const { is_in_grace_period } = computePremiumGraceFlags(user);

        if (!isPremium && !is_in_grace_period) {
          if (user.premium_until) {
            // Had premium but expired beyond grace period — reset to default
            const defaultOption =
              await this.statusOptionService.getDefaultStatusOption();
            if (!defaultOption) {
              throw new InternalServerErrorException(
                "Default status option not found",
              );
            }
            await this.statusRepository.upsert(
              {
                user_id: userId,
                option_id: defaultOption.id,
                note: null,
                expires_at: null,
              },
              ["user_id"],
            );
            throw new BadRequestException(
              "Your premium subscription has expired. Your status has been reset to the default. Upgrade to Pro to use custom statuses again.",
            );
          } else {
            throw new BadRequestException(
              "Custom statuses are only available with Instant Status Pro. Upgrade to use custom statuses.",
            );
          }
        }
      }

      // Validate expiresAt is in the future
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException("Expiration time must be in the future");
      }

      // Use upsert() to atomically handle update-or-insert, preventing race conditions
      const updateData = {
        user_id: userId,
        option_id: optionId,
        note: note || null,
        expires_at: expiresAt || null,
      };

      await this.statusRepository.upsert(updateData, ["user_id"]);

      // Reload the status with relations to ensure we have the latest data
      const reloadedStatus = await this.statusRepository.findOne({
        where: { user_id: userId },
        relations: ["option"],
      });

      if (!reloadedStatus) {
        throw new InternalServerErrorException(
          "Failed to reload status after update",
        );
      }

      // Send push notifications to visible connections (don't fail if this fails)
      // Note: Firebase/Apple handle throttling on their end if notifications are sent too rapidly
      // Display name is passed from controller to avoid extra database query
      this.sendStatusUpdatePush(
        userId,
        option,
        displayName,
        note,
        expiresAt,
      ).catch((error) => {
        this.logger.warn(
          `Failed to send push notifications for status update: ${error.message}`,
        );
      });

      return { status: reloadedStatus, option };
    } catch (error: any) {
      // Re-throw NestJS exceptions as-is
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
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
  private async checkAndCorrectExpiration(
    status: Status | null,
  ): Promise<Status | null> {
    if (!status) return null;

    const now = new Date();
    if (status.expires_at && status.expires_at <= now) {
      // Status is expired - reset to default "Available" option
      const defaultOption =
        await this.statusOptionService.getDefaultStatusOption();
      if (defaultOption) {
        status.option_id = defaultOption.id;
        status.expires_at = null;
        status.note = null;
        // Update the option relation manually
        status.option = defaultOption;
        // Persist the correction (fire and forget to avoid blocking)
        this.statusRepository
          .update(
            { user_id: status.user_id },
            {
              option_id: defaultOption.id,
              expires_at: null,
              note: null,
            },
          )
          .catch((error) => {
            this.logger.warn(
              `Failed to persist expired status correction: ${error.message}`,
            );
          });
      } else {
        this.logger.warn(
          "Cannot correct expired status: default status option not found",
        );
      }
    }

    return status;
  }

  /**
   * Checks and corrects multiple expired statuses in bulk.
   * Uses PostgreSQL NOW() for accurate timezone-aware comparison.
   * More efficient than checking individually.
   */
  private async checkAndCorrectExpiredStatuses(
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;

    try {
      // Get default "Available" option
      const defaultOption =
        await this.statusOptionService.getDefaultStatusOption();
      if (!defaultOption) {
        this.logger.warn(
          "Default status option not found, skipping expired status correction",
        );
        return;
      }

      // Use PostgreSQL NOW() to compare timestamps correctly across timezones
      await this.statusRepository
        .createQueryBuilder()
        .update(Status)
        .set({
          option_id: defaultOption.id,
          expires_at: null,
          note: null,
        })
        .where("user_id IN (:...userIds)", { userIds })
        .andWhere("expires_at IS NOT NULL")
        .andWhere("expires_at <= NOW()")
        .execute();
    } catch (error: any) {
      this.logger.warn(
        `Failed to bulk correct expired statuses: ${error.message}`,
      );
      // Don't throw - this is a background correction
    }
  }

  async getUserStatus(userId: string) {
    try {
      const status = await this.statusRepository.findOne({
        where: { user_id: userId },
        relations: ["option"],
      });

      // Apply lazy expiration check
      return await this.checkAndCorrectExpiration(status);
    } catch (error: any) {
      this.logger.error(
        `Error getting user status: ${error.message}`,
        error.stack,
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

      if (friendIds.length === 0) {
        return [];
      }

      // Check and correct expired statuses in bulk before fetching
      await this.checkAndCorrectExpiredStatuses(friendIds);

      // Get statuses for all friends
      const statuses = await this.statusRepository.find({
        where: friendIds.map((id) => ({ user_id: id })),
        relations: ["user", "option"],
      });

      // Create a map of friendId -> status for quick lookup
      // Filter out statuses where user is null (user was deleted but status still exists)
      const statusMap = new Map(
        statuses
          .filter((status) => status.user !== null)
          .map((status) => [status.user_id, status]),
      );

      // Get default option for fallback
      const defaultOption =
        await this.statusOptionService.getDefaultStatusOption();

      // Return status for each friend connection
      // If visibility is false, return default status
      return friendConnections.map((fc) => {
        const status = statusMap.get(fc.friendId);

        // If visibility is false, return default status
        if (!fc.visibility) {
          return {
            user_id: fc.friendId,
            first_name: fc.friend.first_name,
            last_name: fc.friend.last_name,
            avatar_url: null,
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
            updated_at: new Date(0).toISOString(),
          };
        }

        if (!status) {
          return {
            user_id: fc.friendId,
            first_name: fc.friend.first_name,
            last_name: fc.friend.last_name,
            avatar_url: null,
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
            updated_at: new Date(0).toISOString(),
          };
        }

        // Status should already be corrected by bulk update, but return with option
        // If option is null (shouldn't happen with eager loading, but handle gracefully)
        if (!status.option) {
          this.logger.warn(
            `Status for user ${redactUid(status.user_id)} has invalid option_id: ${status.option_id}`,
          );
        }

        return {
          user_id: status.user_id,
          first_name: status.user.first_name,
          last_name: status.user.last_name,
          avatar_url: null, // TODO: Add avatar_url to User entity if needed
          option: status.option
            ? {
                id: status.option.id,
                label: status.option.label,
                emoji: status.option.emoji,
                color: status.option.color,
              }
            : defaultOption
              ? {
                  id: defaultOption.id,
                  label: defaultOption.label,
                  emoji: defaultOption.emoji,
                  color: defaultOption.color,
                }
              : null,
          note: status.note,
          expires_at: status.expires_at?.toISOString() ?? null,
          updated_at: status.updated_at.toISOString(),
        };
      });
    } catch (error: any) {
      this.logger.error(
        `Error getting friends status: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException("Failed to get friends status");
    }
  }

  private async sendStatusUpdatePush(
    userId: string,
    option: StatusOption,
    displayName: string,
    note?: string,
    expiresAt?: Date,
  ) {
    try {
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
        (conn) => conn.a_shows_status && conn.b_shows_status,
      );

      const connectionUserIds = visibleConnections.map((conn) =>
        conn.user_id === userId ? conn.friend_id : conn.user_id,
      );

      // Only send notifications to friends, not to the user themselves
      // Widget doesn't show user's own status, so no need for self-notification
      const friendUserIds = [...new Set(connectionUserIds)];

      if (friendUserIds.length === 0) return;

      // Get device tokens for friends only (exclude self)
      const deviceTokens = await this.deviceTokenRepository.find({
        where: { user_id: In(friendUserIds) },
      });

      if (deviceTokens.length === 0) return;

      // Prepare notification title and body using option data
      // Display name is passed as parameter to avoid database query
      const title = `${displayName} is ${option.label.toLowerCase()}`;
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
        option_id: option.id,
        option_label: option.label,
        option_emoji: option.emoji,
        option_color: option.color,
        note: truncatedNote || "",
        expires_at: expiresAt ? expiresAt.toISOString() : "",
        timestamp, // Allows widget to detect stale data
      };

      // Build messages array and map tokens to device token IDs for error handling
      const messages: any[] = [];
      const tokenToIdMap = new Map<string, string>(); // Maps FCM token -> device token ID

      // Send visible notifications to friends only
      for (const token of deviceTokens) {
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

        // iOS: separate data-only background message so RN setBackgroundMessageHandler can run
        // even when the alert path does not deliver data to JS (common with notification+alert).
        // Same payload as alert `data` so the handler can apply updateFriendStatus locally without
        // relying on an authenticated API call in headless mode.
        if (token.platform === Platform.IOS) {
          messages.push({
            token: token.token,
            data: commonData,
            apns: {
              headers: {
                "apns-push-type": "background",
                "apns-priority": "5",
              },
              payload: {
                aps: {
                  "content-available": 1,
                },
              },
            },
          });
        }
      }

      try {
        await sendEachAndCleanup(
          this.firebaseAdmin,
          messages,
          tokenToIdMap,
          this.deviceTokenRepository,
          this.logger,
        );
      } catch (error: any) {
        this.logger.error(
          `Error sending push notifications: ${error.message}`,
          error.stack,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error preparing status update push: ${error.message}`,
        error.stack,
      );
    }
  }
}
