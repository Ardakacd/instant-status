import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { User } from "./user.entity";

/**
 * Connection entity with normalized pair ordering.
 * Always stores user_id < friend_id (alphabetically sorted).
 * This ensures:
 * - No duplicate connections (A-B and B-A become the same row)
 * - Unique constraint works correctly
 * - Race conditions are prevented at DB level
 */
@Entity("connections")
@Unique("unique_connection_pair", ["user_id", "friend_id"])
export class Connection {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  user_id: string;

  @Column({ type: "uuid" })
  friend_id: string;

  /**
   * Visibility model: Both users must opt-in for status sharing.
   * user_id = a (alphabetically smaller UUID)
   * friend_id = b (alphabetically larger UUID)
   * Status is visible only if: a_shows_status && b_shows_status
   */
  @Column({ type: "boolean", default: true })
  a_shows_status: boolean;

  @Column({ type: "boolean", default: true })
  b_shows_status: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, (user) => user.connections)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "friend_id" })
  friend: User;
}
