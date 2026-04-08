import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WebhooksController } from "../webhooks.controller";
import { WebhooksService } from "../webhooks.service";

describe("WebhooksController", () => {
  let controller: WebhooksController;
  let mockWebhooksService: { handleRevenueCatEvent: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  const VALID_SECRET = "test-webhook-secret";
  const VALID_AUTH = `Bearer ${VALID_SECRET}`;

  const makePayload = (overrides: Record<string, any> = {}) => ({
    event: {
      id: "evt_001",
      type: "INITIAL_PURCHASE",
      app_user_id: "user_abc",
      environment: "SANDBOX",
      ...overrides,
    },
  });

  beforeEach(async () => {
    mockWebhooksService = {
      handleRevenueCatEvent: jest.fn().mockResolvedValue(undefined),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue(VALID_SECRET),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  describe("POST /webhooks/revenuecat", () => {
    describe("authentication", () => {
      it("throws 401 when REVENUECAT_WEBHOOK_SECRET is not configured", async () => {
        mockConfigService.get.mockReturnValue(undefined);
        await expect(
          controller.handleRevenueCatWebhook(makePayload(), VALID_AUTH)
        ).rejects.toThrow(UnauthorizedException);
      });

      it("throws 401 when Authorization header is missing", async () => {
        await expect(
          controller.handleRevenueCatWebhook(makePayload(), undefined)
        ).rejects.toThrow(UnauthorizedException);
      });

      it("throws 401 when Bearer token is wrong", async () => {
        await expect(
          controller.handleRevenueCatWebhook(makePayload(), "Bearer wrong-token")
        ).rejects.toThrow(UnauthorizedException);
      });

      it("passes with correct Bearer token", async () => {
        await expect(
          controller.handleRevenueCatWebhook(makePayload(), VALID_AUTH)
        ).resolves.toEqual({ received: true });
      });

      it("passes when auth header has surrounding whitespace (trim applied)", async () => {
        // authHeader?.trim() normalises outer whitespace
        await expect(
          controller.handleRevenueCatWebhook(makePayload(), `  ${VALID_AUTH}  `)
        ).resolves.toEqual({ received: true });
      });
    });

    describe("Zod validation", () => {
      it("throws 400 when event.id is missing", async () => {
        const payload = { event: { type: "INITIAL_PURCHASE", app_user_id: "user_abc" } };
        await expect(
          controller.handleRevenueCatWebhook(payload, VALID_AUTH)
        ).rejects.toThrow(BadRequestException);
      });

      it("throws 400 when event.type is invalid", async () => {
        const payload = { event: { id: "evt_001", type: "BOGUS_TYPE", app_user_id: "user_abc" } };
        await expect(
          controller.handleRevenueCatWebhook(payload, VALID_AUTH)
        ).rejects.toThrow(BadRequestException);
      });

      it("throws 400 when event object is missing", async () => {
        await expect(
          controller.handleRevenueCatWebhook({}, VALID_AUTH)
        ).rejects.toThrow(BadRequestException);
      });

      it("accepts valid minimal payload (id + type only)", async () => {
        const payload = { event: { id: "evt_min", type: "TEST" } };
        await expect(
          controller.handleRevenueCatWebhook(payload, VALID_AUTH)
        ).resolves.toEqual({ received: true });
      });

      it.each([
        "INITIAL_PURCHASE",
        "RENEWAL",
        "CANCELLATION",
        "UNCANCELLATION",
        "NON_RENEWING_PURCHASE",
        "EXPIRATION",
        "BILLING_ISSUE",
        "TRANSFER",
        "TEST",
      ])("accepts valid event type: %s", async (type) => {
        const payload = { event: { id: `evt_${type}`, type } };
        await expect(
          controller.handleRevenueCatWebhook(payload, VALID_AUTH)
        ).resolves.toEqual({ received: true });
      });
    });

    describe("service delegation", () => {
      it("calls webhooksService.handleRevenueCatEvent with the parsed event", async () => {
        const payload = makePayload();
        await controller.handleRevenueCatWebhook(payload, VALID_AUTH);
        expect(mockWebhooksService.handleRevenueCatEvent).toHaveBeenCalledWith(payload);
      });

      it("propagates service errors so RevenueCat will retry", async () => {
        mockWebhooksService.handleRevenueCatEvent.mockRejectedValue(
          new Error("Database connection failed")
        );
        await expect(
          controller.handleRevenueCatWebhook(makePayload(), VALID_AUTH)
        ).rejects.toThrow("Database connection failed");
      });

      it("returns { received: true } on success", async () => {
        const result = await controller.handleRevenueCatWebhook(makePayload(), VALID_AUTH);
        expect(result).toEqual({ received: true });
      });
    });
  });
});
