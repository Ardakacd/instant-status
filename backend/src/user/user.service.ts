import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { Status } from "../entities/status.entity";
import { StatusOption } from "../entities/status-option.entity";
import { EmailService } from "../email/email.service";
import { StatusOptionService } from "../status-option/status-option.service";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Status)
    private statusRepository: Repository<Status>,
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
      const user = this.userRepository.create(data);
      const savedUser = await this.userRepository.save(user);

      // Create default status with default "Available" option
      const defaultOption =
        await this.statusOptionService.getDefaultStatusOption();
      if (defaultOption) {
        const status = this.statusRepository.create({
          user_id: savedUser.id,
          option_id: defaultOption.id,
        });
        await this.statusRepository.save(status);
      }

      return savedUser;
    } catch (error: any) {
      // Handle unique constraint violations
      if (error.code === "23505") {
        this.logger.warn(
          `Attempted to create duplicate user: ${data.firebase_uid}`,
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
          this.logger.log(
            `Welcome email sent to ${updatedUser.email} after onboarding completion`,
          );
        } catch (error: any) {
          // Don't fail update if welcome email fails
          this.logger.warn(
            `Failed to send welcome email to ${updatedUser.email}: ${error.message}`,
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

  async updatePremiumStatus(
    id: string,
    isPremium: boolean,
    premiumUntil?: Date | null,
    revenuecatId?: string | null,
  ): Promise<User> {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new NotFoundException("User not found");
      }

      user.is_premium = isPremium;
      if (premiumUntil !== undefined) {
        user.premium_until = premiumUntil;
      }
      if (revenuecatId !== undefined) {
        user.revenuecat_id = revenuecatId;
      }

      return await this.userRepository.save(user);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      this.logger.error(
        `Error updating premium status: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException("Failed to update premium status");
    }
  }

  /**
   * Update premium status by RevenueCat customer ID
   * Used by webhooks when RevenueCat ID is provided but not user ID
   */
  async updatePremiumStatusByRevenueCatId(
    revenuecatId: string,
    isPremium: boolean,
    premiumUntil?: Date | null,
  ): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { revenuecat_id: revenuecatId },
      });

      if (!user) {
        this.logger.warn(`User not found for RevenueCat ID: ${revenuecatId}`);
        return null;
      }

      return await this.updatePremiumStatus(
        user.id,
        isPremium,
        premiumUntil,
        revenuecatId,
      );
    } catch (error: any) {
      this.logger.error(
        `Error updating premium status by RevenueCat ID: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        "Failed to update premium status by RevenueCat ID",
      );
    }
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
