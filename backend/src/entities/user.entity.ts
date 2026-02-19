import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from "typeorm";
import { Status } from "./status.entity";
import { Connection } from "./connection.entity";
import { InviteCode } from "./invite-code.entity";
import { DeviceToken } from "./device-token.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 128, unique: true, nullable: false })
  firebase_uid: string;

  @Column({ type: "varchar", length: 255, unique: true, nullable: true })
  email: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  first_name: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  last_name: string | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  first_login_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_login_at: Date | null;

  /**
   * Single source of truth for premium status.
   * null = not premium. Non-null and future = premium active.
   * Use get isPremiumActive() or isUserPremium(user) to check.
   */
  @Column({ type: "timestamp with time zone", nullable: true })
  premium_until: Date | null;

  get isPremiumActive(): boolean {
    if (!this.premium_until) return false;
    return new Date() < new Date(this.premium_until);
  }

  @Column({ type: "varchar", length: 255, nullable: true })
  revenuecat_id: string | null;
  
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => Status, (status) => status.user)
  status: Status;

  @OneToMany(() => Connection, (connection) => connection.user)
  connections: Connection[];

  @OneToMany(() => InviteCode, (inviteCode) => inviteCode.owner)
  inviteCodes: InviteCode[];

  @OneToMany(() => DeviceToken, (deviceToken) => deviceToken.user)
  deviceTokens: DeviceToken[];
}
