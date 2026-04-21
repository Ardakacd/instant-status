import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository, IsNull, MoreThan } from "typeorm";
import { InviteCode } from "../entities/invite-code.entity";
import { User } from "../entities/user.entity";
import { ConnectionsService } from "../connections/connections.service";
import { redactUid } from "../utils/redact";

@Injectable()
export class InviteCodeService {
  private readonly logger = new StructuredLogger(InviteCodeService.name);

  constructor(
    @InjectRepository(InviteCode)
    private inviteCodeRepository: Repository<InviteCode>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private connectionsService: ConnectionsService,
    private dataSource: DataSource
  ) {}

  async generateCode(
    userId: string,
    expiresInHours?: number
  ): Promise<InviteCode> {
    try {
      if (expiresInHours !== undefined) {
        if (expiresInHours <= 0) {
          throw new BadRequestException(
            "Expiration hours must be greater than 0"
          );
        }
        if (expiresInHours > 8760) {
          // Max 1 year
          throw new BadRequestException(
            "Expiration hours cannot exceed 8760 (1 year)"
          );
        }
      }

      // Default to 1 day expiration if not specified
      const defaultExpirationHours = 24;
      const expirationHours = expiresInHours ?? defaultExpirationHours;
      const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

      // Reuse the latest unexpired, unused code for this user if one exists.
      // This prevents accumulating stale codes on every ConnectScreen mount.
      if (expiresInHours === undefined) {
        const existing = await this.inviteCodeRepository.findOne({
          where: {
            owner_user_id: userId,
            used_by_user_id: IsNull(),
            expires_at: MoreThan(new Date()),
          },
          order: { created_at: "DESC" },
        });
        if (existing) return existing;
      }

      return await this.dataSource.transaction(async (manager) => {
        let code!: string;
        const maxAttempts = 10;

        for (let attempts = 0; attempts < maxAttempts; attempts++) {
          code = this.generateRandomCode();

          try {
            const invite = manager.create(InviteCode, {
              code,
              owner_user_id: userId,
              expires_at: expiresAt,
            });

            return await manager.save(invite);
          } catch (err: any) {
            if (err.code === "23505") {
              // Unique violation → retry
              this.logger.warn(
                `Code collision detected for code ${code}, attempt ${attempts + 1}/${maxAttempts}`
              );
              continue;
            }
            this.logger.error(
              `Unexpected error generating invite code: ${err.message}`,
              err.stack
            );
            throw new InternalServerErrorException(
              "Failed to generate invite code"
            );
          }
        }

        // Failed to generate unique code after max attempts
        this.logger.error(
          `Failed to generate unique invite code after ${maxAttempts} attempts for user ${userId}`
        );
        throw new InternalServerErrorException(
          "Failed to generate unique invite code. Please try again."
        );
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Unexpected error in generateCode: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "An error occurred while generating invite code"
      );
    }
  }

  async redeemCode(userId: string, code: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        try {
          // Use PostgreSQL NOW() to check expiration correctly across timezones
          // Use pessimistic locking to prevent concurrent redemptions
          // Use innerJoin instead of leftJoin because we always need the owner
          const inviteCode = await manager
            .createQueryBuilder(InviteCode, "ic")
            .setLock("pessimistic_write")
            .innerJoinAndSelect("ic.owner", "owner")
            .where("ic.code = :code", { code: code.toUpperCase() })
            .andWhere("(ic.expires_at IS NULL OR ic.expires_at > NOW())")
            .getOne();

          if (!inviteCode) {
            throw new NotFoundException("Invalid or expired invite code");
          }

          if (inviteCode.used_by_user_id) {
            throw new BadRequestException("Invite code has already been used");
          }

          if (inviteCode.owner_user_id === userId) {
            throw new BadRequestException("Cannot use your own invite code");
          }

          // Mark as used
          inviteCode.used_by_user_id = userId;
          inviteCode.used_at = new Date();
          await manager.save(inviteCode);

          const connection = await this.connectionsService.createFromInvite(
            userId,
            inviteCode.owner_user_id,
            manager
          );

          this.logger.log(
            `User ${redactUid(userId)} successfully redeemed invite code from user ${redactUid(inviteCode.owner_user_id)}`
          );

          return {
            connection,
            owner: {
              id: inviteCode.owner.id,
              display_name:
                inviteCode.owner.first_name && inviteCode.owner.last_name
                  ? `${inviteCode.owner.first_name} ${inviteCode.owner.last_name}`
                  : inviteCode.owner.first_name ||
                    inviteCode.owner.last_name ||
                    null,
            },
          };
        } catch (error) {
          if (
            error instanceof NotFoundException ||
            error instanceof BadRequestException
          ) {
            throw error;
          }
          this.logger.error(
            `Database error redeeming invite code: ${error.message}`,
            error.stack
          );
          throw new InternalServerErrorException(
            "Failed to redeem invite code. Please try again."
          );
        }
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `Unexpected error in redeemCode: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "An error occurred while redeeming invite code"
      );
    }
  }

  async connectByLink(userId: string, targetUserId: string) {
    try {
      if (userId === targetUserId) {
        throw new BadRequestException("Cannot connect to yourself");
      }

      // Check if target user exists
      const targetUser = await this.userRepository.findOne({
        where: { id: targetUserId },
      });

      if (!targetUser) {
        throw new NotFoundException(
          "We could not find this person. The link may be incorrect or outdated. Ask your friend to send their invite again.",
        );
      }

      // Use a transaction with pessimistic lock to prevent concurrent duplicate connections.
      // Without locking, two simultaneous requests can both pass the "already connected" check
      // and both attempt to insert, causing one to fail with an opaque ISE.
      const connection = await this.dataSource.transaction(async (manager) => {
        const [a, b] = [userId, targetUserId].sort();
        const existing = await manager
          .createQueryBuilder()
          .setLock("pessimistic_write")
          .from("connections", "c")
          .where("c.user_id = :a AND c.friend_id = :b", { a, b })
          .getExists();

        if (existing) {
          throw new BadRequestException(
            "You are already connected with this user"
          );
        }

        // Create connection directly (shareable links are multi-use)
        return this.connectionsService.createFromInvite(userId, targetUserId, manager);
      });

      this.logger.log(
        `User ${redactUid(userId)} successfully connected to user ${redactUid(targetUserId)} via shareable link`
      );

      return {
        connection,
        owner: {
          id: targetUser.id,
          first_name: targetUser.first_name,
          last_name: targetUser.last_name,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Unexpected error in connectByLink: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "An error occurred while connecting via link"
      );
    }
  }

  private generateRandomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
