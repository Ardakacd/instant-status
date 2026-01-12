import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  JoinColumn,
  OneToOne,
} from "typeorm";
import { User } from "./user.entity";

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

  @Column({
    type: "enum",
    enum: StatusState,
    default: StatusState.AVAILABLE,
  })
  state: StatusState;

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
