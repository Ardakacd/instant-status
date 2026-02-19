import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Tracks processed RevenueCat webhook event IDs for idempotency.
 * Prevents double-processing when RevenueCat retries webhooks.
 */
@Entity("processed_webhooks")
@Index("IDX_processed_webhooks_event_id", ["event_id"], { unique: true })
export class ProcessedWebhook {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255, unique: true })
  event_id: string;

  @CreateDateColumn()
  processed_at: Date;
}
