import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  forwardRef,
  Inject,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, IsNull } from "typeorm";
import { StatusOption } from "../entities/status-option.entity";
import { Status } from "../entities/status.entity";
import { UserService } from "../user/user.service";
import { MAX_CUSTOM_STATUS_OPTIONS } from "./status-option.constants";
import { isUserPremium, computePremiumGraceFlags } from "../utils/premium";

@Injectable()
export class StatusOptionService {
  private readonly logger = new StructuredLogger(StatusOptionService.name);
  private cachedDefaultOption: StatusOption | null | undefined = undefined; // undefined = not yet loaded

  constructor(
    @InjectRepository(StatusOption)
    private statusOptionRepository: Repository<StatusOption>,
    private dataSource: DataSource,
    @Inject(forwardRef(() => UserService))
    private userService: UserService
  ) {}

  /**
   * Get all status options available to a user
   * Returns both system statuses (user_id = null) and user's custom statuses
   * Guarantees consistent ordering: System statuses first (by sort_order), then custom statuses (by sort_order)
   */
  async getUserStatusOptions(userId: string): Promise<StatusOption[]> {
    try {
      // Fetch all status options (system and user's custom) in a single query
      const allOptions = await this.statusOptionRepository.find({
        where: [
          { user_id: IsNull() },
          { user_id: userId }
        ],
        order: { sort_order: 'ASC' }
      });

      // Split them in memory
      const systemStatuses = allOptions.filter(opt => opt.user_id === null);
      const customStatuses = allOptions.filter(opt => opt.user_id === userId);

      // Always return system statuses first, then custom statuses
      return [...systemStatuses, ...customStatuses];
    } catch (error: any) {
      this.logger.error(
        `Error getting user status options: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to get status options");
    }
  }

  /**
   * Get a specific status option by ID
   * User can only access system statuses or their own custom statuses
   */
  async getStatusOptionById(
    optionId: string,
    userId: string
  ): Promise<StatusOption> {
    try {
      const option = await this.statusOptionRepository.findOne({
        where: { id: optionId },
      });

      if (!option) {
        throw new NotFoundException("Status option not found");
      }

      // User can only access system statuses (user_id = null) or their own custom statuses
      if (option.user_id !== null && option.user_id !== userId) {
        throw new NotFoundException("Status option not found");
      }

      return option;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error getting status option: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to get status option");
    }
  }

  /**
   * Check if user has premium access (including grace period)
   * Returns true if user is premium or in grace period
   */
  private async hasPremiumAccess(userId: string): Promise<boolean> {
    const user = await this.userService.findById(userId);
    if (!user) return false;
    const { is_in_grace_period } = computePremiumGraceFlags(user);
    return isUserPremium(user) || is_in_grace_period;
  }

  /**
   * Create a custom status option for a user
   * Maximum custom status options per user (see MAX_CUSTOM_STATUS_OPTIONS)
   * Requires premium access (or grace period)
   */
  async createCustomStatusOption(
    userId: string,
    label: string,
    emoji: string,
    color: string,
    sortOrder?: number
  ): Promise<StatusOption> {
    try {
      // Check premium access outside transaction — avoids holding a DB lock during the user lookup
      const hasAccess = await this.hasPremiumAccess(userId);
      if (!hasAccess) {
        throw new BadRequestException(
          "Custom status options are only available with Instant Status Pro. Upgrade to create custom statuses."
        );
      }

      // Wrap count check + insert in a transaction to prevent race conditions where two
      // concurrent requests both pass the < MAX guard and both insert, exceeding the limit.
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(StatusOption);

        const customOptionsCount = await repo.count({
          where: { user_id: userId },
        });

        if (customOptionsCount >= MAX_CUSTOM_STATUS_OPTIONS) {
          throw new BadRequestException(
            `Maximum limit of ${MAX_CUSTOM_STATUS_OPTIONS} custom status options reached. Please delete an existing custom status option before creating a new one.`
          );
        }

        // Get the highest sort_order for this user's custom statuses
        // Custom statuses start from 1000 to avoid conflicts with system statuses (0-1)
        const CUSTOM_STATUS_START_ORDER = 1000;
        const maxSortOrder =
          (await repo
            .createQueryBuilder("option")
            .select("MAX(option.sort_order)", "max")
            .where("option.user_id = :userId", { userId })
            .getRawOne())?.max ?? CUSTOM_STATUS_START_ORDER - 1;

        const option = repo.create({
          user_id: userId,
          label: label.trim(),
          emoji: emoji.trim(),
          color: color.toUpperCase(),
          sort_order: sortOrder ?? Math.max(maxSortOrder + 1, CUSTOM_STATUS_START_ORDER),
        });

        return await repo.save(option);
      });
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Error creating custom status option: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "Failed to create custom status option"
      );
    }
  }

  /**
   * Update a custom status option
   * User can only update their own custom statuses
   */
  async updateCustomStatusOption(
    optionId: string,
    userId: string,
    updates: {
      label?: string;
      emoji?: string;
      color?: string;
      sort_order?: number;
    }
  ): Promise<StatusOption> {
    try {
      const option = await this.statusOptionRepository.findOne({
        where: { id: optionId },
      });

      if (!option) {
        throw new NotFoundException("Status option not found");
      }

      // System statuses cannot be updated
      if (option.user_id === null) {
        throw new BadRequestException("Cannot update system status option");
      }

      // User can only update their own custom statuses
      if (option.user_id !== userId) {
        throw new NotFoundException("Status option not found");
      }

      // Check premium access (including grace period)
      const hasAccess = await this.hasPremiumAccess(userId);
      if (!hasAccess) {
        throw new BadRequestException(
          "Custom status options are only available with Instant Status Pro. Upgrade to edit custom statuses."
        );
      }

      if (updates.label !== undefined) {
        option.label = updates.label.trim();
      }

      if (updates.emoji !== undefined) {
        option.emoji = updates.emoji.trim();
      }

      if (updates.color !== undefined) {
        option.color = updates.color.toUpperCase();
      }

      if (updates.sort_order !== undefined) {
        option.sort_order = updates.sort_order;
      }

      try {
        return await this.statusOptionRepository.save(option);
      } catch (saveError: any) {
        // sort_order unique constraint violation — another option already occupies this value.
        // Retry once with the next available sort_order for this user.
        if (saveError.code === "23505" && updates.sort_order !== undefined) {
          const CUSTOM_STATUS_START_ORDER = 1000;
          const maxRow = await this.statusOptionRepository
            .createQueryBuilder("o")
            .select("MAX(o.sort_order)", "max")
            .where("o.user_id = :userId", { userId })
            .getRawOne();
          option.sort_order = Math.max(
            (maxRow?.max ?? CUSTOM_STATUS_START_ORDER - 1) + 1,
            CUSTOM_STATUS_START_ORDER,
          );
          return await this.statusOptionRepository.save(option);
        }
        throw saveError;
      }
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Error updating custom status option: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "Failed to update custom status option"
      );
    }
  }

  /**
   * Delete a custom status option
   * User can only delete their own custom statuses
   * If any statuses are using this option, they will be updated to the default "Available" option
   */
  async deleteCustomStatusOption(
    optionId: string,
    userId: string
  ): Promise<void> {
    try {
      const option = await this.statusOptionRepository.findOne({
        where: { id: optionId },
      });

      if (!option) {
        throw new NotFoundException("Status option not found");
      }

      // System statuses cannot be deleted
      if (option.user_id === null) {
        throw new BadRequestException("Cannot delete system status option");
      }

      // User can only delete their own custom statuses
      if (option.user_id !== userId) {
        throw new NotFoundException("Status option not found");
      }

      // Use a transaction to ensure atomicity
      await this.dataSource.transaction(async (manager) => {
        const statusRepository = manager.getRepository(Status);
        const statusOptionRepository = manager.getRepository(StatusOption);

        // Check if any statuses are using this option
        const statusesUsingOption = await statusRepository.find({
          where: { option_id: optionId },
        });

        // If statuses are using this option, update them to default "Available"
        if (statusesUsingOption.length > 0) {
          // Get default option within the transaction
          const defaultOption = await statusOptionRepository.findOne({
            where: { is_default: true, user_id: IsNull() },
            order: { sort_order: "ASC" },
          });
          
          if (!defaultOption) {
            throw new InternalServerErrorException(
              "Cannot delete status option: default status option not found"
            );
          }

          // Update all statuses using this option to the default option
          await statusRepository.update(
            { option_id: optionId },
            { option_id: defaultOption.id }
          );

          this.logger.log(
            `Updated ${statusesUsingOption.length} status(es) from deleted option "${option.label}" to default "Available"`
          );
        }

        // Delete the status option
        await statusOptionRepository.remove(option);
      });
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Error deleting custom status option: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "Failed to delete custom status option"
      );
    }
  }

  /**
   * Get the default "Available" status option (system status)
   * Used when creating new users
   */
  async getDefaultStatusOption(): Promise<StatusOption | null> {
    if (this.cachedDefaultOption !== undefined) {
      return this.cachedDefaultOption;
    }
    try {
      this.cachedDefaultOption = await this.statusOptionRepository.findOne({
        where: { is_default: true, user_id: IsNull() },
        order: { sort_order: "ASC" },
      });
      return this.cachedDefaultOption;
    } catch (error: any) {
      this.logger.error(
        `Error getting default status option: ${error.message}`,
        error.stack
      );
      return null;
    }
  }
}

