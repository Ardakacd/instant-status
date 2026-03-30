import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Connection } from "../entities/connection.entity";
import { DeviceToken } from "../entities/device-token.entity";
import { User } from "../entities/user.entity";
import { isUserPremium, PREMIUM_GRACE_PERIOD_MS, CUSTOM_STATUS_POST_EXPIRY_RESET_MS } from "../utils/premium";
import * as admin from "firebase-admin";
import { getFirebaseAdmin } from "../config/firebase-admin.config";
import { sendEachAndCleanup } from "../utils/fcm";

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
  private readonly logger = new StructuredLogger(ConnectionsService.name);
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
   * Get the friend count for a user
   * Counts connections where user appears in either user_id or friend_id position
   */
  async getFriendCount(userId: string): Promise<number> {
    try {
      const count = await this.connectionRepository.count({
        where: [{ user_id: userId }, { friend_id: userId }],
      });
      return count;
    } catch (error: any) {
      this.logger.error(
        `Error getting friend count: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to get friend count");
    }
  }

  /**
   * Get the friend limit for a user based on their premium status
   */
  getFriendLimit(user: User): number {
    return isUserPremium(user) ? 24 : 6;
  }

  /**
   * Check if a user is currently premium (uses shared isUserPremium)
   */
  isUserPremium(user: User): boolean {
    return isUserPremium(user);
  }

  /**
   * Check if user is in grace period after premium expiration
   * Grace period: 3 days after expiration date
   */
  isInGracePeriod(user: User): boolean {
    if (!user.premium_until) return false;

    const now = new Date();
    const expirationDate = new Date(user.premium_until);
    return (
      now >= expirationDate &&
      now < new Date(expirationDate.getTime() + PREMIUM_GRACE_PERIOD_MS)
    );
  }

  /**
   * Check if user's custom status should be reset (24 hours after expiration)
   */
  shouldResetCustomStatus(user: User): boolean {
    if (!user.premium_until) return false;

    const now = new Date();
    const expirationDate = new Date(user.premium_until);
    return now >= new Date(expirationDate.getTime() + CUSTOM_STATUS_POST_EXPIRY_RESET_MS);
  }

  /**
   * Check if a user can add more friends
   * Returns { canAdd: boolean, currentCount: number, limit: number, errorMessage?: string, isGrandfathered?: boolean }
   * 
   * Grandfathering Logic:
   * - Users who had premium and added 24 friends can keep all 24 friends
   * - They cannot add NEW friends if they have more than 6 (free limit)
   * - If they delete a friend and go below 6, they can add again up to 6
   */
  async checkFriendLimit(userId: string): Promise<{
    canAdd: boolean;
    currentCount: number;
    limit: number;
    errorMessage?: string;
    isGrandfathered?: boolean;
    freeLimit: number;
  }> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException("User not found");
      }

      const currentCount = await this.getFriendCount(userId);
      const isPremium = this.isUserPremium(user);
      const isInGrace = this.isInGracePeriod(user);
      const freeLimit = 6;
      const premiumLimit = 24;
      
      // If user is premium (or in grace period), they can add up to 24
      if (isPremium || isInGrace) {
        const limit = premiumLimit;
        if (currentCount >= limit) {
          return {
            canAdd: false,
            currentCount,
            limit,
            freeLimit,
            errorMessage: "You've reached the limit of 24 friends.",
          };
        }
        return {
          canAdd: true,
          currentCount,
          limit,
          freeLimit,
        };
      }

      // User is not premium - check grandfathering
      // If they have more than 6 friends, they're grandfathered (can't add new ones)
      if (currentCount > freeLimit) {
        return {
          canAdd: false,
          currentCount,
          limit: freeLimit, // Their effective limit for adding new friends
          freeLimit,
          isGrandfathered: true,
          errorMessage: `You've reached the free limit of ${freeLimit} friends. You can keep your existing ${currentCount} friends, but cannot add new ones until you upgrade to Pro or remove friends down to ${freeLimit}.`,
        };
      }

      // User has 6 or fewer friends - can add up to 6
      if (currentCount >= freeLimit) {
        return {
          canAdd: false,
          currentCount,
          limit: freeLimit,
          freeLimit,
          errorMessage: `You've reached the limit of ${freeLimit} friends. Upgrade to Pro for up to 24!`,
        };
      }

      return {
        canAdd: true,
        currentCount,
        limit: freeLimit,
        freeLimit,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error checking friend limit: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to check friend limit");
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

    // Use transaction manager if provided, otherwise use repository.
    // All DB operations within this function use these manager-aware repos so that
    // the friend-limit check and the insert are atomic when called inside a transaction.
    const repo = manager
      ? manager.getRepository(Connection)
      : this.connectionRepository;
    const userRepo = manager
      ? manager.getRepository(User)
      : this.userRepository;

    try {
      // Check if connection already exists (using normalized pair)
      const existing = await repo.findOne({
        where: { user_id: a, friend_id: b },
      });

      if (existing) {
        return existing;
      }

      // Check friend limits for BOTH users before creating connection.
      // Uses the same repo/userRepo as the insert so the check is inside the transaction.
      const [userA, userB] = await Promise.all([
        userRepo.findOne({ where: { id: userId } }),
        userRepo.findOne({ where: { id: friendId } }),
      ]);

      if (!userA || !userB) {
        throw new NotFoundException("User not found");
      }

      // Count friends using the transactional repo to avoid TOCTOU races
      const [friendCountA, friendCountB] = await Promise.all([
        repo.count({ where: [{ user_id: userId }, { friend_id: userId }] }),
        repo.count({ where: [{ user_id: friendId }, { friend_id: friendId }] }),
      ]);

      const limitA = this.getFriendLimit(userA);
      const isPremiumA = this.isUserPremium(userA);

      if (friendCountA >= limitA) {
        const errorMsg = isPremiumA
          ? "You've reached the limit of 24 friends."
          : "You've reached the limit of 6 friends. Upgrade to Pro for up to 24!";
        throw new BadRequestException(errorMsg);
      }

      const limitB = this.getFriendLimit(userB);
      const isPremiumB = this.isUserPremium(userB);

      if (friendCountB >= limitB) {
        const errorMsg = isPremiumB
          ? "This person has reached the limit of 24 friends and cannot add more friends right now."
          : "This person has reached the limit of 6 friends and cannot add more friends right now.";
        throw new BadRequestException(errorMsg);
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
            `Unique constraint violation but connection not found: ${err.message}`,
            err.stack
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
          `Error sending friend added push notifications: ${error.message}`,
          error.stack,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error preparing friend added push: ${error.message}`,
        error.stack
      );
    }
  }
}
