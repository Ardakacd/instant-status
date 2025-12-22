import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('invite_codes')
export class InviteCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16, unique: true })
  code: string;

  @Column({ type: 'uuid' })
  owner_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expires_at: Date | null;

  @Column({ type: 'uuid', nullable: true})
  used_by_user_id: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  used_at: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_user_id' })
  owner: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'used_by_user_id' })
  usedBy: User;
}

