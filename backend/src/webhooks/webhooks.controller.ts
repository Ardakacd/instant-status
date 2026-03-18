import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { SkipThrottle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import { WebhooksService } from "./webhooks.service";
import { z } from "zod";

/**
 * RevenueCat Webhook Controller
 *
 * Handles webhook events from RevenueCat to keep premium status in sync.
 * Skip rate limiting – webhooks use Bearer auth and RevenueCat may retry.
 *
 * Webhook events handled:
 * - INITIAL_PURCHASE: User makes their first purchase
 * - RENEWAL: Subscription renews
 * - CANCELLATION: Subscription is cancelled (but may still be active until expiration)
 * - UNCANCELLATION: User reactivates a cancelled subscription
 * - NON_RENEWING_PURCHASE: One-time purchase (like lifetime)
 * - EXPIRATION: Subscription expires
 * - BILLING_ISSUE: Payment failed
 *
 * Security: Authenticated via Bearer token
 */
@SkipThrottle()
@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new StructuredLogger(WebhooksController.name);

  constructor(
    private webhooksService: WebhooksService,
    private configService: ConfigService,
  ) {}

  @Post("revenuecat")
  @HttpCode(HttpStatus.OK)
  async handleRevenueCatWebhook(
    @Body() body: unknown,
    @Headers("authorization") authHeader?: string,
  ) {
    const secret =
      this.configService.get<string>("REVENUECAT_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.error("REVENUECAT_WEBHOOK_SECRET is not set");
      throw new UnauthorizedException("Invalid webhook authorization");
    }
    const expectedAuth = `Bearer ${secret}`;
    if (authHeader?.trim() !== expectedAuth) {
      this.logger.warn("Invalid webhook authorization");
      throw new UnauthorizedException("Invalid webhook authorization");
    }

    try {
      const event = RevenueCatWebhookSchema.parse(body);
      
      this.logger.log(
        `Received RevenueCat webhook: ${event.event.type} for app_user_id: ${event.event.app_user_id ?? (event.event.type === "TRANSFER" ? "transfer" : "unknown")}`
      );

      await this.webhooksService.handleRevenueCatEvent(event);

      return { received: true };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map((e: { path: (string | number)[]; message: string }) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        this.logger.error("Invalid webhook payload (validation failed)", {
          event: "webhook_validation",
          errors: details,
        });
        throw new BadRequestException("Invalid webhook payload");
      }
      
      this.logger.error(
        `Error processing RevenueCat webhook: ${error.message}`,
        error.stack
      );
      
      // Return 200 to prevent RevenueCat from retrying
      // Log the error for investigation
      return { received: true, error: "Processing failed" };
    }
  }
}

/**
 * RevenueCat Webhook Event Schema
 * Simplified schema focusing on the fields we need
 */
const RevenueCatWebhookSchema = z.object({
  event: z.object({
    id: z.string(),
    type: z.enum([
      "INITIAL_PURCHASE",
      "RENEWAL",
      "CANCELLATION",
      "UNCANCELLATION",
      "NON_RENEWING_PURCHASE",
      "EXPIRATION",
      "BILLING_ISSUE",
      "PRODUCT_CHANGE",
      "SUBSCRIPTION_PAUSED",
      "SUBSCRIPTION_EXTENDED",
      "TRANSFER",
    ]),
    // app_user_id is omitted for TRANSFER events
    app_user_id: z.string().optional(),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).optional(), // May contain Firebase UID or RevenueCat IDs
    transferred_from: z.array(z.string()).optional(), // Only for TRANSFER: IDs losing entitlement
    transferred_to: z.array(z.string()).optional(), // Only for TRANSFER: IDs gaining entitlement
    product_id: z.string().optional(),
    period_type: z.enum(["NORMAL", "TRIAL", "INTRO"]).optional(),
    purchased_at_ms: z.number().optional(),
    expiration_at_ms: z.number().optional(),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
    entitlement_ids: z.array(z.string()).optional(),
  }),
});

export type RevenueCatWebhookEvent = z.infer<typeof RevenueCatWebhookSchema>;

