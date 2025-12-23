import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Connection } from "../entities/connection.entity";

/**
 * Normalizes a user pair to ensure consistent ordering.
 * Always returns [smaller_id, larger_id] for stable storage.
 * This prevents duplicate connections (A-B vs B-A).
 */
function normalizePair(userId: string, friendId: string): [string, string] {
  return userId < friendId ? [userId, friendId] : [friendId, userId];
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    @InjectRepository(Connection)
    private connectionRepository: Repository<Connection>
  ) {}

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

      // Determine which field to update based on which user is making the request
      if (userId === a) {
        connection.a_shows_status = showsStatus;
      } else {
        connection.b_shows_status = showsStatus;
      }

      return await this.connectionRepository.save(connection);
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

    // Use transaction manager if provided, otherwise use repository
    const repo = manager
      ? manager.getRepository(Connection)
      : this.connectionRepository;

    try {
      // Check if connection already exists (using normalized pair)
      const existing = await repo.findOne({
        where: { user_id: a, friend_id: b },
      });

      if (existing) {
        return existing;
      }

      // Create new connection with normalized pair
      // Both users start with visibility enabled by default
      const connection = repo.create({
        user_id: a,
        friend_id: b,
        a_shows_status: true,
        b_shows_status: true,
      });

      return await repo.save(connection);
    } catch (err: any) {
      // Handle unique constraint violation (race condition)
      // Another request created the connection between our check and save
      if (err.code === "23505") {
        const existing = await repo.findOne({
          where: { user_id: a, friend_id: b },
        });
        if (!existing) {
          this.logger.error(
            `Unique constraint violation but connection not found: ${err.message}`
          );
          throw new InternalServerErrorException("Failed to create connection");
        }
        return existing;
      }
      this.logger.error(`Error creating connection: ${err.message}`, err.stack);
      throw new InternalServerErrorException("Failed to create connection");
    }
  }
}
