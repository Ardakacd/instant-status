import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { InternalServerErrorException } from "@nestjs/common";

import { DeviceTokenService } from "../device-token.service";
import { DeviceToken, Platform } from "../../entities/device-token.entity";
import { UserService } from "../../user/user.service";
import { EmailService } from "../../email/email.service";
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
  user.first_login_at = new Date("2026-01-01T00:00:00.000Z");
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

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockDeviceTokenRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
});

const mockUserService = () => ({
  findById: jest.fn(),
});

const mockEmailService = () => ({
  sendNewDeviceAlert: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("DeviceTokenService", () => {
  let service: DeviceTokenService;
  let deviceTokenRepo: ReturnType<typeof mockDeviceTokenRepository>;
  let userService: ReturnType<typeof mockUserService>;
  let emailService: ReturnType<typeof mockEmailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTokenService,
        {
          provide: getRepositoryToken(DeviceToken),
          useFactory: mockDeviceTokenRepository,
        },
        { provide: UserService, useFactory: mockUserService },
        { provide: EmailService, useFactory: mockEmailService },
      ],
    }).compile();

    service = module.get<DeviceTokenService>(DeviceTokenService);
    deviceTokenRepo = module.get(getRepositoryToken(DeviceToken));
    userService = module.get(UserService);
    emailService = module.get(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // registerToken
  // =========================================================================

  describe("registerToken", () => {
    it("creates a new token when none exists for user+platform", async () => {
      const savedToken = makeDeviceToken();
      deviceTokenRepo.findOne.mockResolvedValue(null); // no existing token for this platform
      deviceTokenRepo.find.mockResolvedValue([]);      // no other tokens for this user either
      deviceTokenRepo.create.mockReturnValue(savedToken);
      deviceTokenRepo.save.mockResolvedValue(savedToken);

      const result = await service.registerToken(
        "user-uuid-1",
        "fcm-token-abc",
        Platform.IOS,
      );

      expect(deviceTokenRepo.create).toHaveBeenCalledWith({
        user_id: "user-uuid-1",
        token: "fcm-token-abc",
        platform: Platform.IOS,
      });
      expect(deviceTokenRepo.save).toHaveBeenCalledWith(savedToken);
      expect(result).toBe(savedToken);
    });

    it("updates existing token when one already exists for user+platform (upsert)", async () => {
      const existing = makeDeviceToken({ token: "old-token" });
      const updated = makeDeviceToken({ token: "new-token" });
      deviceTokenRepo.findOne.mockResolvedValue(existing);
      deviceTokenRepo.save.mockResolvedValue(updated);

      const result = await service.registerToken(
        "user-uuid-1",
        "new-token",
        Platform.IOS,
      );

      // Token field should be overwritten before save
      expect(existing.token).toBe("new-token");
      // Should save the existing row, not create a new one
      expect(deviceTokenRepo.create).not.toHaveBeenCalled();
      expect(deviceTokenRepo.save).toHaveBeenCalledWith(existing);
      expect(result).toBe(updated);
    });

    it("sends new device alert when user has existing devices on other platforms and has first_login_at", async () => {
      const user = makeUser({ first_login_at: new Date("2026-01-01T00:00:00.000Z") });
      const androidToken = makeDeviceToken({ platform: Platform.ANDROID });
      const newIosToken = makeDeviceToken({ platform: Platform.IOS });

      deviceTokenRepo.findOne.mockResolvedValue(null); // no existing iOS token
      deviceTokenRepo.find.mockResolvedValue([androidToken]); // has Android token
      deviceTokenRepo.create.mockReturnValue(newIosToken);
      deviceTokenRepo.save.mockResolvedValue(newIosToken);
      userService.findById.mockResolvedValue(user);
      emailService.sendNewDeviceAlert.mockResolvedValue(undefined);

      await service.registerToken("user-uuid-1", "new-ios-token", Platform.IOS);

      expect(userService.findById).toHaveBeenCalledWith("user-uuid-1");
      expect(emailService.sendNewDeviceAlert).toHaveBeenCalledWith(
        user.email,
        { platform: Platform.IOS },
        user.first_name,
      );
    });

    it("does NOT send email if it is the user's first device (no other existing tokens)", async () => {
      const newToken = makeDeviceToken();
      deviceTokenRepo.findOne.mockResolvedValue(null); // no existing token for platform
      deviceTokenRepo.find.mockResolvedValue([]);      // no other tokens at all
      deviceTokenRepo.create.mockReturnValue(newToken);
      deviceTokenRepo.save.mockResolvedValue(newToken);

      await service.registerToken("user-uuid-1", "fcm-token", Platform.IOS);

      expect(emailService.sendNewDeviceAlert).not.toHaveBeenCalled();
      expect(userService.findById).not.toHaveBeenCalled();
    });

    it("does NOT send email if first_login_at is null", async () => {
      const user = makeUser({ first_login_at: null });
      const androidToken = makeDeviceToken({ platform: Platform.ANDROID });
      const newIosToken = makeDeviceToken({ platform: Platform.IOS });

      deviceTokenRepo.findOne.mockResolvedValue(null);
      deviceTokenRepo.find.mockResolvedValue([androidToken]);
      deviceTokenRepo.create.mockReturnValue(newIosToken);
      deviceTokenRepo.save.mockResolvedValue(newIosToken);
      userService.findById.mockResolvedValue(user);

      await service.registerToken("user-uuid-1", "new-ios-token", Platform.IOS);

      expect(emailService.sendNewDeviceAlert).not.toHaveBeenCalled();
    });

    it("does NOT send email if platform already has a token (token refresh, not new device)", async () => {
      const existing = makeDeviceToken({ token: "old-ios-token", platform: Platform.IOS });
      const updated = makeDeviceToken({ token: "refreshed-ios-token", platform: Platform.IOS });
      deviceTokenRepo.findOne.mockResolvedValue(existing); // existing iOS token found
      deviceTokenRepo.save.mockResolvedValue(updated);

      await service.registerToken("user-uuid-1", "refreshed-ios-token", Platform.IOS);

      // When updating an existing token, the email branch is never reached
      expect(userService.findById).not.toHaveBeenCalled();
      expect(emailService.sendNewDeviceAlert).not.toHaveBeenCalled();
    });

    it("gracefully handles email service failure — does not throw, still returns token", async () => {
      const user = makeUser({ first_login_at: new Date("2026-01-01T00:00:00.000Z") });
      const androidToken = makeDeviceToken({ platform: Platform.ANDROID });
      const newIosToken = makeDeviceToken({ platform: Platform.IOS });

      deviceTokenRepo.findOne.mockResolvedValue(null);
      deviceTokenRepo.find.mockResolvedValue([androidToken]);
      deviceTokenRepo.create.mockReturnValue(newIosToken);
      deviceTokenRepo.save.mockResolvedValue(newIosToken);
      userService.findById.mockResolvedValue(user);
      emailService.sendNewDeviceAlert.mockRejectedValue(new Error("SMTP timeout"));

      // Should not throw despite the email failure
      const result = await service.registerToken("user-uuid-1", "new-ios-token", Platform.IOS);

      expect(result).toBe(newIosToken);
    });

    it("throws InternalServerErrorException on DB failure", async () => {
      deviceTokenRepo.findOne.mockRejectedValue(new Error("DB connection lost"));

      await expect(
        service.registerToken("user-uuid-1", "token", Platform.IOS),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // deleteToken
  // =========================================================================

  describe("deleteToken", () => {
    it("deletes the token successfully when user owns it", async () => {
      deviceTokenRepo.delete.mockResolvedValue({ affected: 1 });

      await service.deleteToken("dt-uuid-1", "user-uuid-1");

      expect(deviceTokenRepo.delete).toHaveBeenCalledWith({
        id: "dt-uuid-1",
        user_id: "user-uuid-1",
      });
    });

    it("logs warning and returns without error if token not found", async () => {
      deviceTokenRepo.delete.mockResolvedValue({ affected: 0 });

      // Should not throw
      await expect(
        service.deleteToken("nonexistent-uuid", "user-uuid-1"),
      ).resolves.toBeUndefined();
    });

    it("logs warning and returns without error if token belongs to different user", async () => {
      // When user_id does not match, delete returns affected: 0
      deviceTokenRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(
        service.deleteToken("dt-uuid-1", "different-user-uuid"),
      ).resolves.toBeUndefined();

      // The delete call still went through with the correct filter
      expect(deviceTokenRepo.delete).toHaveBeenCalledWith({
        id: "dt-uuid-1",
        user_id: "different-user-uuid",
      });
    });

    it("throws InternalServerErrorException on DB failure", async () => {
      deviceTokenRepo.delete.mockRejectedValue(new Error("DB error"));

      await expect(
        service.deleteToken("dt-uuid-1", "user-uuid-1"),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
