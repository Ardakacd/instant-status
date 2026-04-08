import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, BadRequestException } from "@nestjs/common";

import { DeviceTokenController } from "../device-token.controller";
import { DeviceTokenService } from "../device-token.service";
import { AuthGuard } from "../../auth/auth.guard";
import { DeviceToken, Platform } from "../../entities/device-token.entity";
import { User } from "../../entities/user.entity";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = "user-uuid-1";
  user.firebase_uid = "firebase-uid-1";
  user.email = "alice@example.com";
  user.first_name = "Alice";
  user.last_name = "Smith";
  user.premium_until = null;
  user.revenuecat_id = null;
  user.created_at = new Date("2026-01-01T00:00:00.000Z");
  user.updated_at = new Date("2026-01-01T00:00:00.000Z");
  return Object.assign(user, overrides);
}

function makeDeviceToken(overrides: Partial<DeviceToken> = {}): DeviceToken {
  const dt = new DeviceToken();
  dt.id = "dt-uuid-1";
  dt.user_id = "user-uuid-1";
  dt.token = "fcm-token-abc";
  dt.platform = Platform.IOS;
  dt.created_at = new Date("2026-01-01T00:00:00.000Z");
  dt.updated_at = new Date("2026-01-01T00:00:00.000Z");
  return Object.assign(dt, overrides);
}

// A mock AuthGuard that always allows requests through, attaching req.user.
const mockAuthGuard = {
  canActivate: jest.fn((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = makeUser();
    return true;
  }),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("DeviceTokenController", () => {
  let controller: DeviceTokenController;
  let deviceTokenService: jest.Mocked<
    Pick<DeviceTokenService, "registerToken" | "deleteToken">
  >;

  beforeEach(async () => {
    const mockDeviceTokenService = {
      registerToken: jest.fn(),
      deleteToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceTokenController],
      providers: [
        { provide: DeviceTokenService, useValue: mockDeviceTokenService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<DeviceTokenController>(DeviceTokenController);
    deviceTokenService = module.get(DeviceTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // POST /device-token
  // =========================================================================

  describe("registerToken (POST /device-token)", () => {
    it("calls registerToken and returns { id, platform, created_at }", async () => {
      const savedToken = makeDeviceToken();
      (deviceTokenService.registerToken as jest.Mock).mockResolvedValue(savedToken);

      const fakeReq = { user: makeUser() };
      const body = { token: "fcm-token-abc", platform: Platform.IOS };

      const result = await controller.registerToken(fakeReq as any, body);

      expect(deviceTokenService.registerToken).toHaveBeenCalledWith(
        "user-uuid-1",
        "fcm-token-abc",
        Platform.IOS,
      );
      expect(result).toEqual({
        id: savedToken.id,
        platform: savedToken.platform,
        created_at: savedToken.created_at,
      });
      // Must not leak token string or user_id
      expect(result).not.toHaveProperty("token");
      expect(result).not.toHaveProperty("user_id");
    });

    it("works for Android platform as well", async () => {
      const savedToken = makeDeviceToken({ platform: Platform.ANDROID });
      (deviceTokenService.registerToken as jest.Mock).mockResolvedValue(savedToken);

      const fakeReq = { user: makeUser() };
      const body = { token: "android-fcm-token", platform: Platform.ANDROID };

      const result = await controller.registerToken(fakeReq as any, body);

      expect(deviceTokenService.registerToken).toHaveBeenCalledWith(
        "user-uuid-1",
        "android-fcm-token",
        Platform.ANDROID,
      );
      expect(result.platform).toBe(Platform.ANDROID);
    });

    it("throws for invalid platform value", async () => {
      const fakeReq = { user: makeUser() };
      const body = { token: "fcm-token", platform: "Windows" };

      await expect(
        controller.registerToken(fakeReq as any, body),
      ).rejects.toThrow();

      expect(deviceTokenService.registerToken).not.toHaveBeenCalled();
    });

    it("throws for empty token string", async () => {
      const fakeReq = { user: makeUser() };
      const body = { token: "", platform: Platform.IOS };

      await expect(
        controller.registerToken(fakeReq as any, body),
      ).rejects.toThrow();

      expect(deviceTokenService.registerToken).not.toHaveBeenCalled();
    });

    it("throws for missing token field", async () => {
      const fakeReq = { user: makeUser() };
      const body = { platform: Platform.IOS };

      await expect(
        controller.registerToken(fakeReq as any, body),
      ).rejects.toThrow();

      expect(deviceTokenService.registerToken).not.toHaveBeenCalled();
    });

    it("throws for token string exceeding 500 characters", async () => {
      const fakeReq = { user: makeUser() };
      const body = { token: "a".repeat(501), platform: Platform.IOS };

      await expect(
        controller.registerToken(fakeReq as any, body),
      ).rejects.toThrow();

      expect(deviceTokenService.registerToken).not.toHaveBeenCalled();
    });

    it("accepts token string of exactly 500 characters (boundary — valid)", async () => {
      const savedToken = makeDeviceToken({ token: "a".repeat(500) });
      (deviceTokenService.registerToken as jest.Mock).mockResolvedValue(savedToken);

      const fakeReq = { user: makeUser() };
      const body = { token: "a".repeat(500), platform: Platform.IOS };

      await expect(
        controller.registerToken(fakeReq as any, body),
      ).resolves.toBeDefined();

      expect(deviceTokenService.registerToken).toHaveBeenCalled();
    });

    it("throws for extra unknown fields (strict mode)", async () => {
      const fakeReq = { user: makeUser() };
      const body = {
        token: "fcm-token",
        platform: Platform.IOS,
        extraField: "unexpected",
      };

      await expect(
        controller.registerToken(fakeReq as any, body),
      ).rejects.toThrow();

      expect(deviceTokenService.registerToken).not.toHaveBeenCalled();
    });

    it("throws for missing platform field", async () => {
      const fakeReq = { user: makeUser() };
      const body = { token: "fcm-token" };

      await expect(
        controller.registerToken(fakeReq as any, body),
      ).rejects.toThrow();

      expect(deviceTokenService.registerToken).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // DELETE /device-token/:id
  // =========================================================================

  describe("deleteToken (DELETE /device-token/:id)", () => {
    it("calls deleteToken and returns { message: 'Device token deleted' }", async () => {
      (deviceTokenService.deleteToken as jest.Mock).mockResolvedValue(undefined);

      const fakeReq = { user: makeUser() };
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      const result = await controller.deleteToken(fakeReq as any, validUuid);

      expect(deviceTokenService.deleteToken).toHaveBeenCalledWith(
        validUuid,
        "user-uuid-1",
      );
      expect(result).toEqual({ message: "Device token deleted" });
    });

    it("throws for invalid UUID format in :id param", async () => {
      const fakeReq = { user: makeUser() };
      const invalidId = "not-a-uuid";

      await expect(
        controller.deleteToken(fakeReq as any, invalidId),
      ).rejects.toThrow();

      expect(deviceTokenService.deleteToken).not.toHaveBeenCalled();
    });

    it("throws for empty string as :id param", async () => {
      const fakeReq = { user: makeUser() };

      await expect(
        controller.deleteToken(fakeReq as any, ""),
      ).rejects.toThrow();

      expect(deviceTokenService.deleteToken).not.toHaveBeenCalled();
    });

    it("throws for a plain integer as :id param", async () => {
      const fakeReq = { user: makeUser() };

      await expect(
        controller.deleteToken(fakeReq as any, "12345"),
      ).rejects.toThrow();

      expect(deviceTokenService.deleteToken).not.toHaveBeenCalled();
    });

    it("passes req.user.id (not req.user.firebase_uid) to deleteToken", async () => {
      (deviceTokenService.deleteToken as jest.Mock).mockResolvedValue(undefined);

      const user = makeUser({ id: "specific-db-uuid" });
      const fakeReq = { user };
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      await controller.deleteToken(fakeReq as any, validUuid);

      expect(deviceTokenService.deleteToken).toHaveBeenCalledWith(
        validUuid,
        "specific-db-uuid",
      );
    });

    it("propagates errors thrown by DeviceTokenService.deleteToken", async () => {
      (deviceTokenService.deleteToken as jest.Mock).mockRejectedValue(
        new Error("Unexpected DB error"),
      );

      const fakeReq = { user: makeUser() };
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";

      await expect(
        controller.deleteToken(fakeReq as any, validUuid),
      ).rejects.toThrow("Unexpected DB error");
    });
  });
});
