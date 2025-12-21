import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { Status, StatusState } from "../entities/status.entity";

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Status)
    private statusRepository: Repository<Status>
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { firebase_uid: firebaseUid },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async create(data: {
    firebase_uid: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }): Promise<User> {
    const user = this.userRepository.create(data);
    const savedUser = await this.userRepository.save(user);

    // Create default status
    const status = this.statusRepository.create({
      user_id: savedUser.id,
      state: StatusState.OFFLINE,
    });
    await this.statusRepository.save(status);

    return savedUser;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    Object.assign(user, data);
    return this.userRepository.save(user);
  }
}
