import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { InviteCode } from "../entities/invite-code.entity";
import { User } from "../entities/user.entity";
import { ConnectionsService } from "../connections/connections.service";

@Injectable()
export class InviteCodeService {
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
    // Default to 1 day expiration if not specified
    const defaultExpirationHours = 24; // 1 day
    const expirationHours = expiresInHours ?? defaultExpirationHours;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    return await this.dataSource.transaction(async (manager) => {
      let code!: string;

      for (let attempts = 0; attempts < 10; attempts++) {
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
            continue;
          }
          throw err;
        }
      }

      throw new Error(
        "Failed to generate unique invite code after multiple attempts"
      );
    });
  }

  async redeemCode(userId: string, code: string) {
    return await this.dataSource.transaction(async (manager) => {
      // Use PostgreSQL NOW() to check expiration correctly across timezones
      // Use pessimistic locking to prevent concurrent redemptions
      // Use innerJoin instead of leftJoin because we always need the owner
      const inviteCode = await manager
        .createQueryBuilder(InviteCode, "ic")
        .setLock("pessimistic_write")
        .innerJoinAndSelect("ic.owner", "owner")
        .where("ic.code = :code", { code })
        .andWhere("(ic.expires_at IS NULL OR ic.expires_at > NOW())")
        .getOne();

      if (!inviteCode) {
        throw new NotFoundException("Invalid or expired invite code");
      }

      if (inviteCode.used_by_user_id) {
        throw new BadRequestException("Invite code already used");
      }

      if (inviteCode.owner_user_id === userId) {
        throw new BadRequestException("Cannot use your own invite code");
      }

      // Mark as used
      inviteCode.used_by_user_id = userId;
      inviteCode.used_at = new Date();
      await manager.save(inviteCode);

      // Create connection within the same transaction
      const connection = await this.connectionsService.createFromInvite(
        userId,
        inviteCode.owner_user_id,
        manager
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
    });
  }

  async connectByLink(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("Cannot connect to yourself");
    }

    // Check if user exists
    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException("User not found");
    }

    // Create connection directly (shareable links are multi-use)
    // createFromInvite already handles existing connections
    const connection = await this.connectionsService.createFromInvite(
      userId,
      targetUserId
    );

    return {
      connection,
      owner: {
        id: targetUser.id,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
      },
    };
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
