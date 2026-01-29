import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  JoinColumn,
  OneToOne,
  ManyToOne,
} from "typeorm";
import { User } from "./user.entity";
import { StatusOption } from "./status-option.entity";

/**
 * Legacy enum kept for backward compatibility during migration
 * @deprecated Use StatusOption instead
 */
export enum StatusState {
  AVAILABLE = "AVAILABLE",
  BUSY = "BUSY",
  DND = "DND",
  FOCUS = "FOCUS",
  SOCIAL = "SOCIAL",
  COMMUTE = "COMMUTE",
}

@Entity("statuses")
export class Status {
  @PrimaryColumn({ type: "uuid" })
  user_id: string;

  /**
   * References a StatusOption (system preset or user custom)
   * This replaces the old enum-based state field
   */
  @Column({ type: "uuid" })
  option_id: string;

  @ManyToOne(() => StatusOption, { eager: true })
  @JoinColumn({ name: "option_id" })
  option: StatusOption;

  /**
   * Optional: Allows the user to add a specific message to the preset
   * e.g., Option is "Busy", Note is "Presenting to the board"
   */
  @Column({ type: "varchar", length: 200, nullable: true })
  note: string | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  expires_at: Date | null;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => User, (user) => user.status, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
