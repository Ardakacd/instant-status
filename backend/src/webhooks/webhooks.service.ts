import { Injectable } from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { redactUid } from "../utils/redact";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserService } from "../user/user.service";
import { ProcessedWebhook } from "../entities/processed-webhook.entity";
import { RevenueCatWebhookEvent } from "./webhooks.controller";
import { LIFETIME_PREMIUM_UNTIL } from "../utils/premium";

@Injectable()
export class WebhooksService {
  private readonly logger = new StructuredLogger(WebhooksService.name);

  constructor(
    private userService: UserService,
    @InjectRepository(ProcessedWebhook)
    private processedWebhookRepo: Repository<ProcessedWebhook>,
  ) {}

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

    // 2. ATOMIC IDEMPOTENCY: Claim the event before processing.
    // Unique constraint prevents double-processing; 23505 = already handled.
    try {
      await this.processedWebhookRepo.insert({ event_id: eventId });
    } catch (error: any) {
      if (error.code === "23505") {
        this.logger.debug(`Event ${eventId} already handled. Ignoring.`);
        return;
      }
      this.logger.error(
        `Error claiming webhook event ${eventId}: ${error.message}`,
        error.stack
      );
      throw error;
    }

    // 3. Tag logs so you can filter (e.g. [SANDBOX] vs [PRODUCTION])
    this.logger.log(
      `[${environment ?? "unknown"}] Processing ${type} for ${app_user_id ?? "TRANSFER"}`
    );

    // Check if this is for our premium entitlement
    const isPremiumEntitlement =
      entitlement_ids?.includes("Instant Status Premium") ?? false;

    if (!isPremiumEntitlement && entitlement_ids && entitlement_ids.length > 0) {
      this.logger.debug(
        `Ignoring webhook for non-premium entitlement: ${entitlement_ids.join(", ")}`
      );
      return;
    }

    const premiumUntil = expiration_at_ms
      ? new Date(expiration_at_ms)
      : LIFETIME_PREMIUM_UNTIL;

    try {
      switch (type) {
        case "INITIAL_PURCHASE":
        case "RENEWAL":
        case "PRODUCT_CHANGE": // User changed plan tier
        case "UNCANCELLATION":
        case "NON_RENEWING_PURCHASE": {
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
            `Updated user ${identifier} premium_until: ${premiumUntil === LIFETIME_PREMIUM_UNTIL ? "lifetime" : premiumUntil.toISOString()}`
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
          if (expiration_at_ms == null) break;
          const identifier = await this.resolveUserIdentifier(event.event);
          if (!identifier) break;
          await this.userService.updatePremiumExpirationByRevenueCatId(
            identifier,
            new Date(expiration_at_ms)
          );
          this.logger.log(
            `Updated user ${redactUid(identifier)} cancellation (active until: ${premiumUntil.toISOString()})`
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
        case "SUBSCRIPTION_EXTENDED":
          this.logger.log(
            `[${environment ?? "unknown"}] User ${redactUid(app_user_id ?? "?")} ${type}. No premium change needed.`
          );
          break;

        case "TRANSFER": {
          // Subscription moved from old account(s) to new. Revoke premium from transferor.
          // Transferee will receive RENEWAL/INITIAL_PURCHASE separately.
          const fromIds = transferred_from ?? [];
          for (const oldId of fromIds) {
            const user = await this.userService.findUserByRevenueCatIdentifier(oldId);
            if (user) {
              await this.userService.updatePremiumExpirationByRevenueCatId(
                oldId,
                null
              );
              this.logger.log(`Transfer: revoked premium from ${oldId}`);
            }
          }
          this.logger.log(
            `Transfer: from [${fromIds.map(redactUid).join(", ")}] to [${(transferred_to ?? []).map(redactUid).join(", ")}]`
          );
          break;
        }

        default:
          this.logger.debug(`Unhandled webhook type: ${type}`);
          break;
      }
    } catch (error: any) {
      this.logger.error(
        `Webhook processing failed for event ${eventId}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}

