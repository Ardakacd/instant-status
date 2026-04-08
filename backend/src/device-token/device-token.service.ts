import {
  Injectable,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DeviceToken, Platform } from "../entities/device-token.entity";
import { UserService } from "../user/user.service";
import { EmailService } from "../email/email.service";

@Injectable()
export class DeviceTokenService {
  private readonly logger = new StructuredLogger(DeviceTokenService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
    private emailService: EmailService
  ) {}

  async registerToken(userId: string, token: string, platform: Platform) {
    try {
      // Check if user_id + platform combination already exists
      // Only one row per user_id + platform is allowed
      const existingToken = await this.deviceTokenRepository.findOne({
        where: {
          user_id: userId,
          platform: platform,
        },
      });

      const isNewPlatform = !existingToken;

      if (existingToken) {
        // Overwrite the token field of the existing row (same device, token refreshed)
        existingToken.token = token;
        return await this.deviceTokenRepository.save(existingToken);
      }

      // No existing token found, create new one
      const deviceToken = this.deviceTokenRepository.create({
        user_id: userId,
        token,
        platform,
      });

      // Before saving, check if user has tokens on OTHER platforms (to detect genuinely new device)
      // We don't count the same platform — a reinstall after FCM cleanup looks like a new platform
      // but is not a security-relevant new device.
      const existingTokensForUser = await this.deviceTokenRepository.find({
        where: { user_id: userId },
      });
      const hasOtherDevices = existingTokensForUser.some(
        (t) => t.platform !== platform
      );

      const savedToken = await this.deviceTokenRepository.save(deviceToken);

      // Check if this is a new device (not first login) and send alert
      if (isNewPlatform && hasOtherDevices) {
        try {
          const user = await this.userService.findById(userId);
          if (user && user.email && user.first_login_at) {
            // User has logged in before and has other devices - this is a new device
            await this.emailService.sendNewDeviceAlert(
              user.email,
              {
                platform: platform,
                // Location detection would require IP geolocation service
                // For now, we'll omit it
              },
              user.first_name
            );
          }
        } catch (emailError: any) {
          // Don't fail token registration if email fails
          this.logger.warn(
            `Failed to send new device alert: ${emailError.message}`
          );
        }
      }

      return savedToken;
    } catch (error: any) {
      // 23505 = unique_violation: concurrent request already inserted this (user_id, platform) row
      if (error.code === "23505") {
        this.logger.debug(
          `Concurrent device token registration for user ${userId} on ${platform} — returning existing row`
        );
        const existing = await this.deviceTokenRepository.findOne({
          where: { user_id: userId, platform },
        });
        if (existing) return existing;
      }
      this.logger.error(
        `Error registering device token: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException("Failed to register device token");
    }
  }

  async deleteToken(id: string, userId: string) {
    try {
      const result = await this.deviceTokenRepository.delete({
        id,
        user_id: userId,
      });
      if (result.affected === 0) {
        this.logger.warn(
          `Attempted to delete non-existent or unauthorized device token: ${id}`
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
