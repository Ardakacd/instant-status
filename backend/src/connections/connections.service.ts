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
import { DeviceToken, Platform } from "../entities/device-token.entity";
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

/** User-facing copy for friend-cap errors (keep aligned across checkFriendLimit + createFromInvite). */
const FRIEND_CAP = { free: 6, premium: 24 } as const;

function msgYouAtPremiumCap(): string {
  return `You're at your Pro limit of ${FRIEND_CAP.premium} friends. Remove someone if you want to add another.`;
}

function msgYouAtFreeCap(): string {
  return `You're at the free limit of ${FRIEND_CAP.free} friends. Remove someone to add another, or upgrade to Pro for up to ${FRIEND_CAP.premium}.`;
}

function msgYouGrandfatheredFree(currentCount: number): string {
  return `You can keep all ${currentCount} friends. On the free plan you can only add new friends when you have ${FRIEND_CAP.free} or fewer. Upgrade to Pro, or remove friends until you're at ${FRIEND_CAP.free}.`;
}

function msgTheyAtPremiumCap(): string {
  return `They can't accept new friends right now - they're at their Pro limit (${FRIEND_CAP.premium}). Ask them to remove someone first.`;
}

function msgTheyAtFreeCap(): string {
  return `They can't accept new friends right now - they're at the free limit (${FRIEND_CAP.free}). They can remove someone or upgrade to Pro to add you.`;
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
    return isUserPremium(user) || this.isInGracePeriod(user)
      ? FRIEND_CAP.premium
      : FRIEND_CAP.free;
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
      const freeLimit = FRIEND_CAP.free;
      const premiumLimit = FRIEND_CAP.premium;

      // If user is premium (or in grace period), they can add up to 24
      if (isPremium || isInGrace) {
        const limit = premiumLimit;
        if (currentCount >= limit) {
          return {
            canAdd: false,
            currentCount,
            limit,
            freeLimit,
            errorMessage: msgYouAtPremiumCap(),
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
          errorMessage: msgYouGrandfatheredFree(currentCount),
        };
      }

      // User has 6 or fewer friends - can add up to 6
      if (currentCount >= freeLimit) {
        return {
          canAdd: false,
          currentCount,
          limit: freeLimit,
          freeLimit,
          errorMessage: msgYouAtFreeCap(),
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

      // Widget snapshot is delta-updated; remove the peer from each side's stored list.
      void Promise.all([
        this.sendFriendRemovedSilentPush(userId, friendId),
        this.sendFriendRemovedSilentPush(friendId, userId),
      ]).catch((error: any) => {
        this.logger.error(
          `Friend removed widget push: ${error.message}`,
          error.stack,
        );
      });
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

      const wasVisible = this.isStatusVisible(connection);

      // Determine which field to update based on which user is making the request
      if (userId === a) {
        connection.a_shows_status = showsStatus;
      } else {
        connection.b_shows_status = showsStatus;
      }

      const nowVisible = this.isStatusVisible(connection);
      const saved = await this.connectionRepository.save(connection);

      // Mutual visibility flips how /status/friends represents this row (real vs default).
      if (wasVisible !== nowVisible) {
        void Promise.all([
          this.sendWidgetFriendsResyncSilentPush(a),
          this.sendWidgetFriendsResyncSilentPush(b),
        ]).catch((error: any) => {
          this.logger.error(
            `Widget resync push after visibility change: ${error.message}`,
            error.stack,
          );
        });
      }

      return saved;
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
        throw new BadRequestException("You are already friends with this user");
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
      if (friendCountA >= limitA) {
        const errorMsg =
          limitA === FRIEND_CAP.premium ? msgYouAtPremiumCap() : msgYouAtFreeCap();
        throw new BadRequestException(errorMsg);
      }

      const limitB = this.getFriendLimit(userB);
      if (friendCountB >= limitB) {
        const errorMsg =
          limitB === FRIEND_CAP.premium ? msgTheyAtPremiumCap() : msgTheyAtFreeCap();
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
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
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

  /**
   * Before user row deletion: CASCADE removes connections without `delete()`, so peers never get
   * `friend_removed` unless we push here.
   */
  async notifyPeersUserAccountDeleted(deletedUserId: string): Promise<void> {
    try {
      const connections = await this.connectionRepository.find({
        where: [{ user_id: deletedUserId }, { friend_id: deletedUserId }],
      });
      if (connections.length === 0) return;

      const peerIds = new Set<string>();
      for (const c of connections) {
        peerIds.add(c.user_id === deletedUserId ? c.friend_id : c.user_id);
      }

      await Promise.all(
        [...peerIds].map((peerId) =>
          this.sendFriendRemovedSilentPush(peerId, deletedUserId),
        ),
      );
    } catch (error: any) {
      this.logger.error(
        `notifyPeersUserAccountDeleted: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Silent data push so clients drop a peer from the widget snapshot (connection deleted).
   */
  private async sendFriendRemovedSilentPush(
    recipientUserId: string,
    removedPeerUserId: string,
  ): Promise<void> {
    const deviceTokens = await this.deviceTokenRepository.find({
      where: { user_id: recipientUserId },
    });
    if (deviceTokens.length === 0) return;

    const commonData: Record<string, string> = {
      type: "friend_removed",
      peer_user_id: removedPeerUserId,
      timestamp: new Date().toISOString(),
    };

    const messages: any[] = [];
    const tokenToIdMap = new Map<string, string>();

    for (const token of deviceTokens) {
      tokenToIdMap.set(token.token, token.id);
      messages.push({
        token: token.token,
        data: commonData,
        android: { priority: "high" as const },
        apns: {
          headers: {
            "apns-push-type": "alert",
            "apns-priority": "5",
          },
          payload: {
            aps: { "content-available": 1, "mutable-content": 1 },
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
        `sendFriendRemovedSilentPush failed for recipient ${recipientUserId}: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * Silent push: refetch GET /status/friends into widget (visibility changes real vs default row).
   */
  private async sendWidgetFriendsResyncSilentPush(
    targetUserId: string,
  ): Promise<void> {
    const deviceTokens = await this.deviceTokenRepository.find({
      where: { user_id: targetUserId },
    });
    if (deviceTokens.length === 0) return;

    const commonData: Record<string, string> = {
      type: "widget_resync_friends",
      timestamp: new Date().toISOString(),
    };

    const messages: any[] = [];
    const tokenToIdMap = new Map<string, string>();

    for (const token of deviceTokens) {
      tokenToIdMap.set(token.token, token.id);
      messages.push({
        token: token.token,
        data: commonData,
        android: { priority: "high" as const },
        apns: {
          headers: {
            "apns-push-type": "alert",
            "apns-priority": "5",
          },
          payload: {
            aps: { "content-available": 1, "mutable-content": 1 },
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
        `sendWidgetFriendsResyncSilentPush failed for user ${targetUserId}: ${error.message}`,
        error.stack
      );
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
                "mutable-content": 1,
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
        return;
      }

      try {
        // Silent resync so widget storage updates without opening the app (iOS alert path often skips JS).
        await this.sendWidgetFriendsResyncSilentPush(friendUserId);
      } catch (error: any) {
        this.logger.error(
          `Friend-added widget resync push: ${error.message}`,
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
