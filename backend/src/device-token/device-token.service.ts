import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DeviceToken, Platform } from "../entities/device-token.entity";

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>
  ) {}

  async registerToken(userId: string, token: string, platform: Platform) {
    try {
      // Validate input
      if (!token || token.trim().length === 0) {
        throw new BadRequestException("Device token is required");
      }

      // Check if token already exists
      let deviceToken = await this.deviceTokenRepository.findOne({
        where: { token },
      });

      if (deviceToken) {
        // Update user_id if different (device reassigned)
        if (deviceToken.user_id !== userId) {
          deviceToken.user_id = userId;
          deviceToken.platform = platform;
          await this.deviceTokenRepository.save(deviceToken);
          this.logger.log(
            `Device token reassigned from user ${deviceToken.user_id} to ${userId}`
          );
        }
        return deviceToken;
      }

      // If token is new but user/platform combination exists, delete old tokens
      // This handles token refresh scenarios where the token changes but user/platform stays same
      const existingTokens = await this.deviceTokenRepository.find({
        where: {
          user_id: userId,
          platform: platform,
        },
      });

      // Delete old tokens for this user/platform combination
      if (existingTokens.length > 0) {
        const oldTokenIds = existingTokens.map((t) => t.id);
        await this.deviceTokenRepository.delete(oldTokenIds);
        this.logger.log(
          `Deleted ${existingTokens.length} old device token(s) for user ${userId} on ${platform}`
        );
      }

      // Create new device token
      deviceToken = this.deviceTokenRepository.create({
        user_id: userId,
        token,
        platform,
      });

      return await this.deviceTokenRepository.save(deviceToken);
    } catch (error: any) {
      // Re-throw NestJS exceptions as-is
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error registering device token: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to register device token");
    }
  }

  async deleteToken(id: string) {
    try {
      const result = await this.deviceTokenRepository.delete(id);
      if (result.affected === 0) {
        this.logger.warn(
          `Attempted to delete non-existent device token: ${id}`
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error deleting device token: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to delete device token");
    }
  }
}
