import { Injectable, OnModuleInit } from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { redactUid } from "../utils/redact";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";
import { UserService } from "../user/user.service";
import { ProcessedWebhook } from "../entities/processed-webhook.entity";
import { RevenueCatWebhookEvent } from "./webhooks.controller";
import { LIFETIME_PREMIUM_UNTIL } from "../utils/premium";

@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new StructuredLogger(WebhooksService.name);

  constructor(
    private userService: UserService,
    @InjectRepository(ProcessedWebhook)
    private processedWebhookRepo: Repository<ProcessedWebhook>,
  ) {}

  /**
   * On startup, delete any rows stuck in 'processing' for more than 5 minutes.
   * These were claimed by a process that crashed before completing or unclaiming,
   * so RevenueCat will retry them and they must not be blocked by a stale row.
   */
  async onModuleInit() {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const deleted = await this.processedWebhookRepo.delete({
      status: "processing",
      claimed_at: LessThan(staleThreshold),
    });
    if (deleted.affected && deleted.affected > 0) {
      this.logger.warn(
        `Startup cleanup: removed ${deleted.affected} stale 'processing' webhook row(s) — RevenueCat will retry them`
      );
    }
  }

  /**
   * Resolve user identity from app_user_id, aliases, and original_app_user_id.
   * Handles the "identity trap": anonymous users who later log in may have
   * Firebase UID in app_user_id or aliases. Returns the first identifier that
   * resolves to a user in our system.
   */
  private async resolveUserIdentifier(event: RevenueCatWebhookEvent["event"]): Promise<string | null> {
    const { app_user_id, original_app_user_id, aliases } = event;
    const candidates = [
      app_user_id,
      ...(aliases ?? []),
      original_app_user_id,
    ].filter((id): id is string => Boolean(id));

    const seen = new Set<string>();
    const uniqueCandidates = candidates.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const results = await Promise.all(
      uniqueCandidates.map((id) =>
        this.userService.findUserByRevenueCatIdentifier(id).then((user) => ({ id, user }))
      )
    );
    const match = results.find((r) => r.user !== null);
    return match ? match.id : null;
  }

  /**
   * Handle RevenueCat webhook events
   * Updates user premium status based on subscription events
   */
  async handleRevenueCatEvent(event: RevenueCatWebhookEvent): Promise<void> {
    const {
      id: eventId,
      environment,
      type,
      app_user_id,
      expiration_at_ms,
      entitlement_ids,
      transferred_from,
      transferred_to,
    } = event.event;

    // 1. Ignore Sandbox events on production server
    const isProductionServer = process.env.NODE_ENV === "production";
    if (isProductionServer && environment === "SANDBOX") {
      this.logger.debug("Skipping Sandbox event on Production server");
      return;
    }

    // 2. Dashboard test webhooks — acknowledge without idempotency row / premium logic
    if (type === "TEST") {
      this.logger.log("RevenueCat TEST webhook received (no-op)");
      return;
    }

    // 3. ATOMIC IDEMPOTENCY: Claim the event before processing.
    // Unique constraint prevents double-processing; 23505 = already claimed/completed.
    try {
      await this.processedWebhookRepo.insert({ event_id: eventId, status: "processing" });
    } catch (error: any) {
      if (error.code === "23505") {
        this.logger.debug(`Event ${eventId} already claimed or completed. Ignoring.`);
        return;
      }
      this.logger.error(
        `Error claiming webhook event ${eventId}: ${error.message}`,
        error.stack
      );
      throw error;
    }

    // 4. Tag logs so you can filter (e.g. [SANDBOX] vs [PRODUCTION])
    this.logger.log(
      `[${environment ?? "unknown"}] Processing ${type} for ${app_user_id ?? "TRANSFER"}`
    );

    // Check if this is for our premium entitlement
    const isPremiumEntitlement =
      entitlement_ids?.includes("Instant Status Premium") ?? false;

    const premiumUntil = expiration_at_ms
      ? new Date(expiration_at_ms)
      : LIFETIME_PREMIUM_UNTIL;

    try {
      if (!isPremiumEntitlement && entitlement_ids && entitlement_ids.length > 0) {
        this.logger.debug(
          `Ignoring webhook for non-premium entitlement: ${entitlement_ids.join(", ")}`
        );
        // fall through to the completed update below
      } else switch (type) {
        case "INITIAL_PURCHASE":
        case "RENEWAL":
        case "UNCANCELLATION":
        case "SUBSCRIPTION_EXTENDED": {
          if (!expiration_at_ms) {
            this.logger.warn(
              `${type} missing expiration_at_ms for ${redactUid(app_user_id)} — skipping to avoid silent lifetime grant`
            );
            break;
          }
          const identifier = await this.resolveUserIdentifier(event.event);
          if (!identifier) {
            this.logger.warn(`No user found for ${type} (app_user_id: ${redactUid(app_user_id)})`);
            break;
          }
          await this.userService.updatePremiumExpirationByRevenueCatId(
            identifier,
            premiumUntil
          );
          this.logger.log(
            `Updated user ${redactUid(identifier)} premium_until: ${premiumUntil.toISOString()}`
          );
          break;
        }

        case "NON_RENEWING_PURCHASE": {
          // One-time purchase — no expiration date, grant lifetime premium
          const identifier = await this.resolveUserIdentifier(event.event);
          if (!identifier) {
            this.logger.warn(`No user found for NON_RENEWING_PURCHASE (app_user_id: ${redactUid(app_user_id)})`);
            break;
          }
          await this.userService.updatePremiumExpirationByRevenueCatId(
            identifier,
            LIFETIME_PREMIUM_UNTIL
          );
          this.logger.log(
            `Updated user ${redactUid(identifier)} premium_until: lifetime (NON_RENEWING_PURCHASE)`
          );
          break;
        }

        case "PRODUCT_CHANGE": {
          // Plan change may move premium_until earlier (downgrade) or later (upgrade).
          // forceUpdate bypasses the newDate > existingDate guard so downgrades apply.
          if (!expiration_at_ms) {
            this.logger.warn(
              `PRODUCT_CHANGE missing expiration_at_ms for ${redactUid(app_user_id)} — skipping to avoid silent lifetime grant`
            );
            break;
          }
          const identifier = await this.resolveUserIdentifier(event.event);
          if (!identifier) {
            this.logger.warn(`No user found for PRODUCT_CHANGE (app_user_id: ${redactUid(app_user_id)})`);
            break;
          }
          await this.userService.updatePremiumExpirationByRevenueCatId(
            identifier,
            premiumUntil,
            true // forceUpdate
          );
          this.logger.log(
            `PRODUCT_CHANGE: updated user ${redactUid(identifier)} premium_until: ${premiumUntil.toISOString()}`
          );
          break;
        }

        case "EXPIRATION": {
          const identifier = await this.resolveUserIdentifier(event.event);
          if (!identifier) break;
          await this.userService.updatePremiumExpirationByRevenueCatId(
            identifier,
            null
          );
          this.logger.log(`Updated user ${redactUid(identifier)} to free (expired)`);
          break;
        }

        case "CANCELLATION": {
          if (expiration_at_ms == null) {
            this.logger.warn(`CANCELLATION for ${redactUid(app_user_id)} has no expiration_at_ms — no change made`);
            break;
          }
          const identifier = await this.resolveUserIdentifier(event.event);
          if (!identifier) break;
          await this.userService.updatePremiumExpirationByRevenueCatId(
            identifier,
            new Date(expiration_at_ms)
          );
          this.logger.log(
            `Updated user ${redactUid(identifier)} cancellation (active until: ${new Date(expiration_at_ms).toISOString()})`
          );
          break;
        }

        case "BILLING_ISSUE":
          // Do NOT revoke. RevenueCat sends EXPIRATION when grace period ends.
          this.logger.warn(
            `Billing issue for user ${redactUid(app_user_id)} - premium maintained until expiration`
          );
          break;

        case "SUBSCRIPTION_PAUSED":
          this.logger.log(
            `[${environment ?? "unknown"}] User ${redactUid(app_user_id ?? "?")} SUBSCRIPTION_PAUSED. No premium change needed.`
          );
          break;

        case "TRANSFER": {
          // Subscription moved from old account(s) to new. Revoke premium from transferor.
          // Transferee will receive RENEWAL/INITIAL_PURCHASE separately.
          const fromIds = transferred_from ?? [];
          const transferErrors: Error[] = [];
          for (const oldId of fromIds) {
            try {
              const user = await this.userService.findUserByRevenueCatIdentifier(oldId);
              if (user) {
                await this.userService.updatePremiumExpirationByRevenueCatId(
                  oldId,
                  null
                );
                this.logger.log(`Transfer: revoked premium from ${redactUid(oldId)}`);
              }
            } catch (transferError: any) {
              // Collect failures — rethrow after the loop so the outer catch
              // can unclaim the event and let RevenueCat retry.
              // Already-revoked IDs are idempotent on retry (premium_until stays null).
              this.logger.error(
                `Transfer: failed to revoke premium from ${redactUid(oldId)}: ${transferError.message}`,
                transferError.stack
              );
              transferErrors.push(transferError);
            }
          }
          this.logger.log(
            `Transfer: from [${fromIds.map(redactUid).join(", ")}] to [${(transferred_to ?? []).map(redactUid).join(", ")}]`
          );
          if (transferErrors.length > 0) {
            throw new Error(
              `Transfer partially failed: ${transferErrors.length}/${fromIds.length} revocation(s) errored`
            );
          }
          break;
        }

        default:
          this.logger.debug(`Unhandled webhook type: ${type}`);
          break;
      }

      // Mark as completed — prevents startup cleanup from treating this row as stale
      await this.processedWebhookRepo.update({ event_id: eventId }, { status: "completed" });
    } catch (error: any) {
      this.logger.error(
        `Webhook processing failed for event ${eventId}: ${error.message}`,
        error.stack
      );
      // Unclaim the event so RevenueCat can retry on the next attempt.
      // If the delete itself fails, log critically — the event stays claimed
      // and will require manual re-processing.
      try {
        await this.processedWebhookRepo.delete({ event_id: eventId });
      } catch (deleteError: any) {
        this.logger.error(
          `CRITICAL: failed to unclaim event ${eventId} after processing error — manual re-processing required: ${deleteError.message}`,
          deleteError.stack
        );
      }
      throw error;
    }
  }
}

