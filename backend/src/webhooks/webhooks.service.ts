import { Injectable, Logger } from "@nestjs/common";
import { UserService } from "../user/user.service";
import { RevenueCatWebhookEvent } from "./webhooks.controller";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private userService: UserService) {}

  /**
   * Handle RevenueCat webhook events
   * Updates user premium status based on subscription events
   */
  async handleRevenueCatEvent(event: RevenueCatWebhookEvent): Promise<void> {
    const { type, app_user_id, expiration_at_ms, entitlement_ids } =
      event.event;

    // Check if this is for our premium entitlement
    const isPremiumEntitlement =
      entitlement_ids?.includes("Instant Status Premium") ?? false;

    if (!isPremiumEntitlement && entitlement_ids && entitlement_ids.length > 0) {
      // Not our entitlement, ignore
      this.logger.debug(
        `Ignoring webhook for non-premium entitlement: ${entitlement_ids.join(", ")}`
      );
      return;
    }

    // Calculate expiration date if provided
    const premiumUntil = expiration_at_ms
      ? new Date(expiration_at_ms)
      : null;

    try {
      switch (type) {
        case "INITIAL_PURCHASE":
        case "RENEWAL":
        case "UNCANCELLATION":
        case "NON_RENEWING_PURCHASE":
          // User is now premium
          await this.userService.updatePremiumStatusByRevenueCatId(
            app_user_id,
            true,
            premiumUntil
          );
          this.logger.log(
            `Updated user ${app_user_id} to premium (until: ${premiumUntil?.toISOString() || "lifetime"})`
          );
          break;

        case "EXPIRATION":
          // Subscription expired
          await this.userService.updatePremiumStatusByRevenueCatId(
            app_user_id,
            false,
            null
          );
          this.logger.log(`Updated user ${app_user_id} to free (expired)`);
          break;

        case "CANCELLATION":
          // Subscription cancelled but still active until expiration
          // Keep is_premium true but update expiration date
          if (premiumUntil) {
            await this.userService.updatePremiumStatusByRevenueCatId(
              app_user_id,
              true,
              premiumUntil
            );
            this.logger.log(
              `Updated user ${app_user_id} cancellation (active until: ${premiumUntil.toISOString()})`
            );
          }
          break;

        case "BILLING_ISSUE":
          // Payment failed - keep premium status but log the issue
          // RevenueCat will send EXPIRATION if payment isn't resolved
          this.logger.warn(
            `Billing issue for user ${app_user_id} - premium status maintained until expiration`
          );
          break;

        default:
          this.logger.debug(`Unhandled webhook type: ${type}`);
          break;
      }
    } catch (error: any) {
      this.logger.error(
        `Error handling RevenueCat webhook: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}

