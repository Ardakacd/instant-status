import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { LessThan } from "typeorm";
import { WebhooksService } from "../webhooks.service";
import { ProcessedWebhook } from "../../entities/processed-webhook.entity";
import { UserService } from "../../user/user.service";
import { LIFETIME_PREMIUM_UNTIL } from "../../utils/premium";

describe("WebhooksService", () => {
  let service: WebhooksService;
  let mockUserService: {
    findUserByRevenueCatIdentifier: jest.Mock;
    updatePremiumExpirationByRevenueCatId: jest.Mock;
  };
  let mockProcessedWebhookRepo: {
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  /** Build a minimal valid RevenueCatWebhookEvent */
  const makeEvent = (overrides: Record<string, any> = {}) => ({
    event: {
      id: "evt_001",
      type: "INITIAL_PURCHASE",
      app_user_id: "user_firebase_abc",
      environment: "PRODUCTION",
      ...overrides,
    },
  });

  beforeEach(async () => {
    mockUserService = {
      findUserByRevenueCatIdentifier: jest.fn().mockResolvedValue({ id: "db_user_id" }),
      updatePremiumExpirationByRevenueCatId: jest.fn().mockResolvedValue(undefined),
    };

    mockProcessedWebhookRepo = {
      insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: UserService, useValue: mockUserService },
        {
          provide: getRepositoryToken(ProcessedWebhook),
          useValue: mockProcessedWebhookRepo,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  // ─── onModuleInit ──────────────────────────────────────────────────────────

  describe("onModuleInit", () => {
    it("deletes stale 'processing' rows older than 5 minutes", async () => {
      mockProcessedWebhookRepo.delete.mockResolvedValue({ affected: 2 });
      await service.onModuleInit();
      expect(mockProcessedWebhookRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "processing",
          claimed_at: expect.anything(),
        })
      );
    });

    it("does not throw when no stale rows exist", async () => {
      mockProcessedWebhookRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  // ─── TEST event ────────────────────────────────────────────────────────────

  describe("TEST event", () => {
    it("returns early without inserting an idempotency row", async () => {
      await service.handleRevenueCatEvent(makeEvent({ type: "TEST" }) as any);
      expect(mockProcessedWebhookRepo.insert).not.toHaveBeenCalled();
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
    });
  });

  // ─── Sandbox filter ────────────────────────────────────────────────────────

  describe("Sandbox filter", () => {
    it("skips SANDBOX events when NODE_ENV is production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        await service.handleRevenueCatEvent(
          makeEvent({ environment: "SANDBOX" }) as any
        );
        expect(mockProcessedWebhookRepo.insert).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("processes SANDBOX events when NODE_ENV is not production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      try {
        await service.handleRevenueCatEvent(
          makeEvent({ environment: "SANDBOX" }) as any
        );
        expect(mockProcessedWebhookRepo.insert).toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // ─── Idempotency ───────────────────────────────────────────────────────────

  describe("idempotency", () => {
    it("silently ignores an already-claimed event (Postgres 23505)", async () => {
      const dupError = Object.assign(new Error("duplicate key"), { code: "23505" });
      mockProcessedWebhookRepo.insert.mockRejectedValue(dupError);

      await expect(
        service.handleRevenueCatEvent(makeEvent() as any)
      ).resolves.not.toThrow();

      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
    });

    it("re-throws non-duplicate insert errors", async () => {
      const ioError = Object.assign(new Error("connection lost"), { code: "08006" });
      mockProcessedWebhookRepo.insert.mockRejectedValue(ioError);

      await expect(
        service.handleRevenueCatEvent(makeEvent() as any)
      ).rejects.toThrow("connection lost");
    });

    it("marks event as 'completed' after successful processing", async () => {
      await service.handleRevenueCatEvent(makeEvent() as any);
      expect(mockProcessedWebhookRepo.update).toHaveBeenCalledWith(
        { event_id: "evt_001" },
        { status: "completed" }
      );
    });

    it("unclames event and rethrows when processing fails", async () => {
      mockUserService.updatePremiumExpirationByRevenueCatId.mockRejectedValue(
        new Error("DB write failed")
      );

      await expect(
        service.handleRevenueCatEvent(makeEvent() as any)
      ).rejects.toThrow("DB write failed");

      expect(mockProcessedWebhookRepo.delete).toHaveBeenCalledWith({ event_id: "evt_001" });
    });
  });

  // ─── Event type handling ───────────────────────────────────────────────────

  describe("INITIAL_PURCHASE", () => {
    it("updates premium_until to expiration_at_ms date", async () => {
      const expirationMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await service.handleRevenueCatEvent(
        makeEvent({ type: "INITIAL_PURCHASE", expiration_at_ms: expirationMs }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "user_firebase_abc",
        new Date(expirationMs)
      );
    });

    it("sets LIFETIME_PREMIUM_UNTIL when expiration_at_ms is absent", async () => {
      await service.handleRevenueCatEvent(
        makeEvent({ type: "INITIAL_PURCHASE" }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "user_firebase_abc",
        LIFETIME_PREMIUM_UNTIL
      );
    });

    it("skips the update when no user is found for app_user_id", async () => {
      mockUserService.findUserByRevenueCatIdentifier.mockResolvedValue(null);
      await service.handleRevenueCatEvent(
        makeEvent({ type: "INITIAL_PURCHASE" }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
    });
  });

  describe("RENEWAL", () => {
    it("updates premium_until to new expiration date", async () => {
      const expirationMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await service.handleRevenueCatEvent(
        makeEvent({ type: "RENEWAL", expiration_at_ms: expirationMs }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "user_firebase_abc",
        new Date(expirationMs)
      );
    });
  });

  describe("CANCELLATION", () => {
    it("keeps premium active until expiration_at_ms", async () => {
      const expirationMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await service.handleRevenueCatEvent(
        makeEvent({ type: "CANCELLATION", expiration_at_ms: expirationMs }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "user_firebase_abc",
        new Date(expirationMs)
      );
    });

    it("makes no premium change when expiration_at_ms is absent", async () => {
      await service.handleRevenueCatEvent(
        makeEvent({ type: "CANCELLATION", expiration_at_ms: undefined }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
    });
  });

  describe("UNCANCELLATION", () => {
    it("restores premium to expiration date", async () => {
      const expirationMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await service.handleRevenueCatEvent(
        makeEvent({ type: "UNCANCELLATION", expiration_at_ms: expirationMs }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "user_firebase_abc",
        new Date(expirationMs)
      );
    });
  });

  describe("NON_RENEWING_PURCHASE", () => {
    it("sets LIFETIME_PREMIUM_UNTIL when no expiration provided", async () => {
      await service.handleRevenueCatEvent(
        makeEvent({ type: "NON_RENEWING_PURCHASE" }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "user_firebase_abc",
        LIFETIME_PREMIUM_UNTIL
      );
    });
  });

  describe("EXPIRATION", () => {
    it("sets premium_until to null (reverts user to free)", async () => {
      await service.handleRevenueCatEvent(
        makeEvent({ type: "EXPIRATION" }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "user_firebase_abc",
        null
      );
    });
  });

  describe("BILLING_ISSUE", () => {
    it("does not revoke premium (waits for EXPIRATION event)", async () => {
      await service.handleRevenueCatEvent(
        makeEvent({ type: "BILLING_ISSUE" }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
    });
  });

  describe("TRANSFER", () => {
    it("revokes premium from all transferred_from users", async () => {
      mockUserService.findUserByRevenueCatIdentifier.mockResolvedValue({ id: "db_user" });

      await service.handleRevenueCatEvent(
        makeEvent({
          type: "TRANSFER",
          app_user_id: undefined,
          transferred_from: ["old_user_1", "old_user_2"],
          transferred_to: ["new_user_1"],
        }) as any
      );

      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "old_user_1",
        null
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "old_user_2",
        null
      );
    });

    it("handles empty transferred_from list gracefully", async () => {
      await expect(
        service.handleRevenueCatEvent(
          makeEvent({
            type: "TRANSFER",
            app_user_id: undefined,
            transferred_from: [],
            transferred_to: ["new_user_1"],
          }) as any
        )
      ).resolves.not.toThrow();
    });

    it("skips revocation when transferred_from user is not found in DB", async () => {
      mockUserService.findUserByRevenueCatIdentifier.mockResolvedValue(null);

      await service.handleRevenueCatEvent(
        makeEvent({
          type: "TRANSFER",
          app_user_id: undefined,
          transferred_from: ["old_user_1"],
          transferred_to: ["new_user_1"],
        }) as any
      );

      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
    });

    it("throws and unclames event if a revocation call fails", async () => {
      mockUserService.findUserByRevenueCatIdentifier.mockResolvedValue({ id: "db_user" });
      mockUserService.updatePremiumExpirationByRevenueCatId.mockRejectedValue(
        new Error("DB error")
      );

      await expect(
        service.handleRevenueCatEvent(
          makeEvent({
            type: "TRANSFER",
            app_user_id: undefined,
            transferred_from: ["old_user_1"],
            transferred_to: ["new_user_1"],
          }) as any
        )
      ).rejects.toThrow();

      expect(mockProcessedWebhookRepo.delete).toHaveBeenCalledWith({ event_id: "evt_001" });
    });
  });

  // ─── Identity resolution ───────────────────────────────────────────────────

  describe("identity resolution", () => {
    it("falls back to aliases when app_user_id has no DB match", async () => {
      mockUserService.findUserByRevenueCatIdentifier.mockImplementation((id: string) => {
        if (id === "alias_firebase_uid") return Promise.resolve({ id: "db_user" });
        return Promise.resolve(null);
      });

      await service.handleRevenueCatEvent(
        makeEvent({
          type: "INITIAL_PURCHASE",
          app_user_id: "rc_anonymous_id",
          aliases: ["alias_firebase_uid"],
        }) as any
      );

      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "alias_firebase_uid",
        expect.anything()
      );
    });

    it("falls back to original_app_user_id when app_user_id and aliases have no match", async () => {
      mockUserService.findUserByRevenueCatIdentifier.mockImplementation((id: string) => {
        if (id === "original_uid") return Promise.resolve({ id: "db_user" });
        return Promise.resolve(null);
      });

      await service.handleRevenueCatEvent(
        makeEvent({
          type: "INITIAL_PURCHASE",
          app_user_id: "rc_anon",
          aliases: ["another_anon"],
          original_app_user_id: "original_uid",
        }) as any
      );

      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalledWith(
        "original_uid",
        expect.anything()
      );
    });

    it("skips update when no candidate resolves to a user", async () => {
      mockUserService.findUserByRevenueCatIdentifier.mockResolvedValue(null);

      await service.handleRevenueCatEvent(
        makeEvent({
          type: "INITIAL_PURCHASE",
          app_user_id: "totally_unknown",
        }) as any
      );

      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
    });
  });

  // ─── Non-premium entitlement filter ───────────────────────────────────────

  describe("non-premium entitlement", () => {
    it("skips premium update for unrecognised entitlement IDs", async () => {
      await service.handleRevenueCatEvent(
        makeEvent({
          type: "INITIAL_PURCHASE",
          entitlement_ids: ["some_other_entitlement"],
        }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).not.toHaveBeenCalled();
      // Still marks the event as completed
      expect(mockProcessedWebhookRepo.update).toHaveBeenCalledWith(
        { event_id: "evt_001" },
        { status: "completed" }
      );
    });

    it("processes event when entitlement_ids contains 'Instant Status Premium'", async () => {
      const expirationMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await service.handleRevenueCatEvent(
        makeEvent({
          type: "INITIAL_PURCHASE",
          expiration_at_ms: expirationMs,
          entitlement_ids: ["Instant Status Premium"],
        }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalled();
    });

    it("processes event when entitlement_ids is null (RC test payloads)", async () => {
      const expirationMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      await service.handleRevenueCatEvent(
        makeEvent({
          type: "INITIAL_PURCHASE",
          expiration_at_ms: expirationMs,
          entitlement_ids: null,
        }) as any
      );
      expect(mockUserService.updatePremiumExpirationByRevenueCatId).toHaveBeenCalled();
    });
  });
});
