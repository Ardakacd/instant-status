import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, IsNull } from "typeorm";
import { StatusOption } from "../entities/status-option.entity";
import { Status } from "../entities/status.entity";

@Injectable()
export class StatusOptionService {
  private readonly logger = new Logger(StatusOptionService.name);

  constructor(
    @InjectRepository(StatusOption)
    private statusOptionRepository: Repository<StatusOption>,
    private dataSource: DataSource
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
   * Create a custom status option for a user
   * Maximum of 4 custom status options allowed per user
   */
  async createCustomStatusOption(
    userId: string,
    label: string,
    emoji: string,
    color: string,
    sortOrder?: number
  ): Promise<StatusOption> {
    try {
      // Validate input
      if (!label || label.trim().length === 0) {
        throw new BadRequestException("Label is required");
      }
      if (label.length > 25) {
        throw new BadRequestException("Label cannot exceed 25 characters");
      }
      if (!emoji || emoji.trim().length === 0) {
        throw new BadRequestException("Emoji is required");
      }
      if (emoji.length > 10) {
        throw new BadRequestException("Emoji cannot exceed 10 characters");
      }
      if (!color || !/^#([0-9A-Fa-f]{3}){1,2}$/.test(color)) {
        throw new BadRequestException(
          "Color must be a valid hex color (e.g., #10B981 or #FFF)"
        );
      }

      // Check if user has reached the maximum limit of 4 custom status options
      const MAX_CUSTOM_OPTIONS = 4;
      const customOptionsCount = await this.statusOptionRepository.count({
        where: { user_id: userId },
      });

      if (customOptionsCount >= MAX_CUSTOM_OPTIONS) {
        throw new BadRequestException(
          `Maximum limit of ${MAX_CUSTOM_OPTIONS} custom status options reached. Please delete an existing custom status option before creating a new one.`
        );
      }

      // Get the highest sort_order for this user's custom statuses
      // Custom statuses start from 1000 to avoid conflicts with system statuses (0-1)
      const CUSTOM_STATUS_START_ORDER = 1000;
      const maxSortOrder =
        (await this.statusOptionRepository
          .createQueryBuilder("option")
          .select("MAX(option.sort_order)", "max")
          .where("option.user_id = :userId", { userId })
          .getRawOne())?.max ?? CUSTOM_STATUS_START_ORDER - 1;

      const option = this.statusOptionRepository.create({
        user_id: userId,
        label: label.trim(),
        emoji: emoji.trim(),
        color: color.toUpperCase(),
        sort_order: sortOrder ?? Math.max(maxSortOrder + 1, CUSTOM_STATUS_START_ORDER),
      });

      return await this.statusOptionRepository.save(option);
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

      // Validate updates
      if (updates.label !== undefined) {
        if (updates.label.trim().length === 0) {
          throw new BadRequestException("Label cannot be empty");
        }
        if (updates.label.length > 25) {
          throw new BadRequestException("Label cannot exceed 25 characters");
        }
        option.label = updates.label.trim();
      }

      if (updates.emoji !== undefined) {
        if (updates.emoji.trim().length === 0) {
          throw new BadRequestException("Emoji cannot be empty");
        }
        if (updates.emoji.length > 10) {
          throw new BadRequestException("Emoji cannot exceed 10 characters");
        }
        option.emoji = updates.emoji.trim();
      }

      if (updates.color !== undefined) {
        if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(updates.color)) {
          throw new BadRequestException(
            "Color must be a valid hex color (e.g., #10B981 or #FFF)"
          );
        }
        option.color = updates.color.toUpperCase();
      }

      if (updates.sort_order !== undefined) {
        option.sort_order = updates.sort_order;
      }

      return await this.statusOptionRepository.save(option);
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

      // User can only delete their own custom statuses
      if (option.user_id !== userId) {
        throw new NotFoundException("Status option not found");
      }

      // System statuses cannot be deleted
      if (option.user_id === null) {
        throw new BadRequestException("Cannot delete system status option");
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
            where: { user_id: IsNull(), label: "Available" },
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
    try {
      return await this.statusOptionRepository.findOne({
        where: { user_id: IsNull(), label: "Available" },
        order: { sort_order: "ASC" },
      });
    } catch (error: any) {
      this.logger.error(
        `Error getting default status option: ${error.message}`,
        error.stack
      );
      return null;
    }
  }
}

