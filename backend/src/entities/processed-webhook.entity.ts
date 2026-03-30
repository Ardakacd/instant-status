import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Tracks RevenueCat webhook event IDs for idempotency.
 *
 * Lifecycle:
 *   1. Row inserted with status='processing' before any DB writes begin.
 *   2. Updated to status='completed' after all writes succeed.
 *   3. Deleted on processing failure so RevenueCat can retry.
 *
 * On server startup, rows stuck in 'processing' for >5 min are deleted —
 * they were abandoned by a crashed process and must be retried by RevenueCat.
 */
@Entity("processed_webhooks")
@Index("IDX_processed_webhooks_event_id", ["event_id"], { unique: true })
export class ProcessedWebhook {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255, unique: true })
  event_id: string;

  @Column({ type: "varchar", length: 20, default: "processing" })
  status: "processing" | "completed";

  @CreateDateColumn()
  claimed_at: Date;
}
