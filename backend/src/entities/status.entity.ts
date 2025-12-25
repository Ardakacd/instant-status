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
  FREE = "FREE",
  BUSY = "BUSY",
  DND = "DND",
  SLEEP = "SLEEP",
  OFFLINE = "OFFLINE",
}

@Entity("statuses")
export class Status {
  @PrimaryColumn({ type: "uuid" })
  user_id: string;

  @Column({
    type: "enum",
    enum: StatusState,
    default: StatusState.OFFLINE,
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
