import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { User } from "../entities/user.entity";
import { Status } from "../entities/status.entity";
import { EmailService } from "../email/email.service";
import { StatusOptionService } from "../status-option/status-option.service";
import { LIFETIME_PREMIUM_UNTIL } from "../utils/premium";
import { redactEmail, redactUid } from "../utils/redact";

@Injectable()
export class UserService {
  private readonly logger = new StructuredLogger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Status)
    private statusRepository: Repository<Status>,
    private dataSource: DataSource,
    private emailService: EmailService,
    private statusOptionService: StatusOptionService,
  ) {}

  async findById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({ where: { id } });
    } catch (error: any) {
      this.logger.error(
        `Error finding user by ID: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException("Failed to find user");
    }
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: { firebase_uid: firebaseUid },
      });
    } catch (error: any) {
      this.logger.error(
        `Error finding user by Firebase UID: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException("Failed to find user");
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({ where: { email } });
    } catch (error: any) {
      this.logger.error(
        `Error finding user by email: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException("Failed to find user");
    }
  }

  async create(data: {
    firebase_uid: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }): Promise<User> {
    try {
      const defaultOption =
        await this.statusOptionService.getDefaultStatusOption();

      return await this.dataSource.transaction(async (manager) => {
        const user = manager.create(User, data);
        const savedUser = await manager.save(user);

        if (defaultOption) {
          const status = manager.create(Status, {
            user_id: savedUser.id,
            option_id: defaultOption.id,
          });
          await manager.save(status);
        }

        return savedUser;
      });
    } catch (error: any) {
      // Handle unique constraint violations
      if (error.code === "23505") {
        this.logger.warn(
          `Attempted to create duplicate user: ${redactUid(data.firebase_uid)}`,
        );
        throw new InternalServerErrorException("User already exists");
      }
      this.logger.error(`Error creating user: ${error.message}`, error.stack);
      throw new InternalServerErrorException("Failed to create user");
    }
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundException("User not found");
      }

      // Check if onboarding is being completed (first time setting first_name and last_name)
      const wasOnboardingIncomplete = !user.first_name || !user.last_name;
      const isCompletingOnboarding =
        wasOnboardingIncomplete && data.first_name && data.last_name;

      Object.assign(user, data);
      const updatedUser = await this.userRepository.save(user);

      // Send welcome email when onboarding is completed
      if (isCompletingOnboarding && updatedUser.email) {
        try {
          await this.emailService.sendWelcomeEmail(
            updatedUser.email,
            updatedUser.first_name,
          );
        } catch (error: any) {
          // Don't fail update if welcome email fails
          this.logger.warn(
            `Failed to send welcome email to ${redactEmail(updatedUser.email)}: ${error.message}`,
          );
        }
      }

      return updatedUser;
    } catch (error: any) {
      // Re-throw NotFoundException as-is
      if (error instanceof NotFoundException) {
        throw error;
      }
      // Re-throw InternalServerErrorException from findById
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error updating user: ${error.message}`, error.stack);
      throw new InternalServerErrorException("Failed to update user");
    }
  }

  /**
   * Smart update for premium status.
   * Handles out-of-order webhooks and protects Lifetime status.
   *
   * @param forceUpdate When true, bypasses the newDate > existingDate guard for
   *   extension events. Use for PRODUCT_CHANGE where a downgrade intentionally
   *   moves premium_until earlier. Lifetime protection always applies.
   */
  async updatePremiumExpiration(
    id: string,
    premiumUntil: Date | null,
    revenuecatId?: string | null,
    forceUpdate = false,
  ): Promise<User> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const now = new Date();
    const newDate = premiumUntil ?? null;
    const existingDate = user.premium_until ?? null;

    let shouldSave = false;

    // ===============================
    // 1. EXTENSION / PURCHASE EVENTS (newDate is a Date)
    // ===============================
    if (newDate !== null) {
      // forceUpdate (PRODUCT_CHANGE): always apply; out-of-order guard skipped
      // because a plan change is an explicit user action, not a delayed webhook.
      // Normal path: only advance premium_until, never shrink it.
      const isLifetime =
        existingDate &&
        existingDate.getTime() === LIFETIME_PREMIUM_UNTIL.getTime();

      if (isLifetime) {
        this.logger.warn(`Blocked attempt to change premium_until on Lifetime user ${id}`);
      } else if (forceUpdate || !existingDate || newDate > existingDate) {
        user.premium_until = newDate;
        shouldSave = true;
        this.logger.log(
          `${forceUpdate ? "Force-updated" : "Extended"} premium for user ${id} to ${newDate.toISOString()}`,
        );
      } else {
        this.logger.debug(
          `Ignoring older/equal premium_until for user ${id} (New: ${newDate.toISOString()}, Existing: ${existingDate.toISOString()})`,
        );
      }
    }

    // ===============================
    // 2. EXPIRATION / REVOKE EVENTS (newDate is null)
    // ===============================
    else {
      // Check if user has a "Lifetime" constant set
      const isLifetime =
        existingDate &&
        existingDate.getTime() === LIFETIME_PREMIUM_UNTIL.getTime();

      if (isLifetime) {
        this.logger.warn(`Blocked attempt to expire Lifetime user ${id}`);
      }
      // Only set to null if the existing subscription has actually passed its end date
      // This prevents a late "EXPIRATION" webhook from killing a very recent "RENEWAL"
      else if (existingDate && existingDate <= now) {
        user.premium_until = null;
        shouldSave = true;
        this.logger.log(`Premium expired/revoked for user ${id}`);
      } else {
        this.logger.debug(
          `Ignored expiration for user ${id}. Current status still valid until ${existingDate?.toISOString()}`,
        );
      }
    }

    // ===============================
    // 3. IDENTITY LINKING
    // ===============================
    if (revenuecatId !== undefined && user.revenuecat_id !== revenuecatId) {
      user.revenuecat_id = revenuecatId;
      shouldSave = true;
    }

    if (!shouldSave) {
      return user;
    }

    return this.userRepository.save(user);
  }

  /**
   * Find user by RevenueCat identifier (app_user_id).
   * Resolves identity trap: app_user_id can be Firebase UID (after logIn) or RevenueCat anonymous ID.
   * Searches revenuecat_id first, then firebase_uid.
   */
  async findUserByRevenueCatIdentifier(
    identifier: string,
  ): Promise<User | null> {
    const byRevenueCatId = await this.userRepository.findOne({
      where: { revenuecat_id: identifier },
    });
    if (byRevenueCatId) return byRevenueCatId;

    const byFirebaseUid = await this.userRepository.findOne({
      where: { firebase_uid: identifier },
    });
    if (byFirebaseUid) {
      // Resolved via firebase_uid — revenuecat_id not yet linked.
      // updatePremiumExpiration will link it on this call.
      this.logger.debug(
        `Resolved RC identifier ${redactUid(identifier)} via firebase_uid (revenuecat_id not yet set)`
      );
    }
    return byFirebaseUid ?? null;
  }

  /**
   * Update premium_until by RevenueCat identifier (app_user_id).
   * Used by webhooks. Resolves identity via revenuecat_id or firebase_uid.
   * For lifetime purchases (expiration_at_ms null), uses far-future date.
   */
  async updatePremiumExpirationByRevenueCatId(
    identifier: string,
    premiumUntil: Date | null,
    forceUpdate = false,
  ): Promise<User | null> {
    const user = await this.findUserByRevenueCatIdentifier(identifier);

    if (!user) {
      this.logger.warn(`User not found for RevenueCat ID: ${redactUid(identifier)}`);
      return null;
    }

    return this.updatePremiumExpiration(user.id, premiumUntil, identifier, forceUpdate);
  }

  async delete(id: string): Promise<void> {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundException("User not found");
      }

      // Cascade delete will handle all related records (statuses, connections, invite codes, device tokens)
      await this.userRepository.remove(user);
      this.logger.log(`User ${id} deleted successfully`);
    } catch (error: any) {
      // Re-throw NotFoundException as-is
      if (error instanceof NotFoundException) {
        throw error;
      }
      // Re-throw InternalServerErrorException from findById
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(`Error deleting user: ${error.message}`, error.stack);
      throw new InternalServerErrorException("Failed to delete user");
    }
  }
}
