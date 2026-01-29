import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";

/**
 * StatusOption Entity
 * 
 * Represents a status option that can be used by users.
 * - If user_id is NULL: System-wide preset status (Available, Busy, etc.)
 * - If user_id is a UUID: Custom status created by that specific user
 */
@Entity("status_options")
@Index(["user_id", "sort_order"]) // Index for efficient querying
export class StatusOption {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * NULL means it's a "System" status (Available, Busy, etc.)
   * A UUID means it's a "Custom" status created by a specific user
   */
  @Column({ type: "uuid", nullable: true })
  user_id: string | null;

  @Column({ type: "varchar", length: 25 })
  label: string; // e.g., "Available", "In a Meeting", "Gaming"

  @Column({ type: "varchar", length: 10 })
  emoji: string; // e.g., "✅", "🤝", "🎮"

  @Column({ type: "varchar", length: 7 })
  color: string; // e.g., "#10B981"

  @Column({ type: "int", default: 0 })
  sort_order: number;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "user_id" })
  user: User | null;
}

