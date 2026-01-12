import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { Status, StatusState } from "../entities/status.entity";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Status)
    private statusRepository: Repository<Status>
  ) {}

  async findById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({ where: { id } });
    } catch (error: any) {
      this.logger.error(
        `Error finding user by ID: ${error.message}`,
        error.stack
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
        error.stack
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
        error.stack
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

      // Create default status
      const status = this.statusRepository.create({
        user_id: savedUser.id,
        state: StatusState.AVAILABLE,
      });
      await this.statusRepository.save(status);

      return savedUser;
    } catch (error: any) {
      // Handle unique constraint violations
      if (error.code === "23505") {
        this.logger.warn(
          `Attempted to create duplicate user: ${data.firebase_uid}`
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

      Object.assign(user, data);
      return await this.userRepository.save(user);
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
