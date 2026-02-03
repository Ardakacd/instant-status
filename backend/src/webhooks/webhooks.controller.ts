import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { z } from "zod";

/**
 * RevenueCat Webhook Controller
 * 
 * Handles webhook events from RevenueCat to keep premium status in sync.
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
 * Security: In production, verify webhook signature from RevenueCat
 */
@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private webhooksService: WebhooksService) {}

  @Post("revenuecat")
  @HttpCode(HttpStatus.OK)
  async handleRevenueCatWebhook(
    @Body() body: unknown,
    @Headers("authorization") authHeader?: string
  ) {
    try {
      // In production, verify webhook signature here
      // const isValid = await this.webhooksService.verifyWebhookSignature(
      //   body,
      //   authHeader
      // );
      // if (!isValid) {
      //   throw new BadRequestException("Invalid webhook signature");
      // }

      const event = RevenueCatWebhookSchema.parse(body);
      
      this.logger.log(
        `Received RevenueCat webhook: ${event.event.type} for app_user_id: ${event.event.app_user_id}`
      );

      await this.webhooksService.handleRevenueCatEvent(event);

      return { received: true };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        this.logger.error(
          `Invalid webhook payload: ${JSON.stringify(error.errors)}`
        );
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
    ]),
    app_user_id: z.string(), // This is the RevenueCat customer ID
    aliases: z.array(z.string()).optional(), // May contain Firebase UID or email
    product_id: z.string().optional(),
    period_type: z.enum(["NORMAL", "TRIAL", "INTRO"]).optional(),
    purchased_at_ms: z.number().optional(),
    expiration_at_ms: z.number().optional(),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
    entitlement_ids: z.array(z.string()).optional(),
  }),
});

export type RevenueCatWebhookEvent = z.infer<typeof RevenueCatWebhookSchema>;

