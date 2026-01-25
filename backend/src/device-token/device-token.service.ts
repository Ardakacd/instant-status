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

      // Check if user_id + platform combination already exists
      // Only one row per user_id + platform is allowed
      const existingToken = await this.deviceTokenRepository.findOne({
        where: {
          user_id: userId,
          platform: platform,
        },
      });

      if (existingToken) {
        // Overwrite the token field of the existing row
        existingToken.token = token;
        return await this.deviceTokenRepository.save(existingToken);
      }

      // No existing token found, create new one
      const deviceToken = this.deviceTokenRepository.create({
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
