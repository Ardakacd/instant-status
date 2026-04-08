import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";

import { StatusService } from "../status.service";
import { Status } from "../../entities/status.entity";
import { StatusOption } from "../../entities/status-option.entity";
import { Connection } from "../../entities/connection.entity";
import { DeviceToken } from "../../entities/device-token.entity";
import { User } from "../../entities/user.entity";
import { StatusOptionService } from "../../status-option/status-option.service";
import { PREMIUM_GRACE_PERIOD_MS } from "../../utils/premium";

// ---------------------------------------------------------------------------
// Mock firebase-admin config — must happen before any import resolves it
// ---------------------------------------------------------------------------

const mockSendEach = jest.fn();

jest.mock("../../config/firebase-admin.config", () => ({
  getFirebaseAdmin: jest.fn(() => ({})),
}));

jest.mock("../../utils/fcm", () => ({
  sendEachAndCleanup: (...args: any[]) => mockSendEach(...args),
}));

jest.mock("../../utils/redact", () => ({
  redactUid: (uid: string) => `[redacted:${uid.slice(0, 4)}]`,
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = "aaaaaaaa-0000-0000-0000-000000000001";
  user.firebase_uid = "firebase-uid-alice";
  user.email = "alice@example.com";
  user.first_name = "Alice";
  user.last_name = "Smith";
  user.premium_until = null;
  user.revenuecat_id = null;
  user.created_at = new Date("2026-01-01T00:00:00.000Z");
  user.updated_at = new Date("2026-01-01T00:00:00.000Z");
  return Object.assign(user, overrides);
}

function makeStatusOption(overrides: Partial<StatusOption> = {}): StatusOption {
  const opt = new StatusOption();
  opt.id = "opt-uuid-available";
  opt.user_id = null; // system preset
  opt.label = "Available";
  opt.emoji = "✅";
  opt.color = "#10B981";
  opt.sort_order = 0;
  return Object.assign(opt, overrides);
}

function makeStatus(overrides: Partial<Status> = {}): Status {
  const status = new Status();
  status.user_id = "aaaaaaaa-0000-0000-0000-000000000001";
  status.option_id = "opt-uuid-available";
  status.option = makeStatusOption();
  status.note = null;
  status.expires_at = null;
  status.updated_at = new Date("2026-04-07T10:00:00.000Z");
  return Object.assign(status, overrides);
}

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  const conn = new Connection();
  conn.id = "conn-uuid-1";
  conn.user_id = "aaaaaaaa-0000-0000-0000-000000000001";
  conn.friend_id = "bbbbbbbb-0000-0000-0000-000000000002";
  conn.a_shows_status = true;
  conn.b_shows_status = true;
  conn.created_at = new Date("2026-01-01T00:00:00.000Z");
  conn.user = makeUser();
  conn.friend = makeUser({
    id: "bbbbbbbb-0000-0000-0000-000000000002",
    first_name: "Bob",
    last_name: "Jones",
    firebase_uid: "firebase-uid-bob",
    email: "bob@example.com",
  });
  return Object.assign(conn, overrides);
}

// ---------------------------------------------------------------------------
// Mock repositories
// ---------------------------------------------------------------------------

const mockStatusRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  upsert: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockConnectionRepo = () => ({
  find: jest.fn(),
});

const mockDeviceTokenRepo = () => ({
  find: jest.fn(),
  delete: jest.fn(),
});

const mockUserRepo = () => ({
  findOne: jest.fn(),
});

const mockStatusOptionService = () => ({
  getStatusOptionById: jest.fn(),
  getDefaultStatusOption: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("StatusService", () => {
  let service: StatusService;
  let statusRepo: ReturnType<typeof mockStatusRepo>;
  let connectionRepo: ReturnType<typeof mockConnectionRepo>;
  let deviceTokenRepo: ReturnType<typeof mockDeviceTokenRepo>;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let statusOptionService: ReturnType<typeof mockStatusOptionService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusService,
        { provide: getRepositoryToken(Status), useFactory: mockStatusRepo },
        { provide: getRepositoryToken(Connection), useFactory: mockConnectionRepo },
        { provide: getRepositoryToken(DeviceToken), useFactory: mockDeviceTokenRepo },
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: StatusOptionService, useFactory: mockStatusOptionService },
      ],
    }).compile();

    service = module.get<StatusService>(StatusService);
    statusRepo = module.get(getRepositoryToken(Status));
    connectionRepo = module.get(getRepositoryToken(Connection));
    deviceTokenRepo = module.get(getRepositoryToken(DeviceToken));
    userRepo = module.get(getRepositoryToken(User));
    statusOptionService = module.get(StatusOptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // updateStatus
  // =========================================================================

  describe("updateStatus", () => {
    const userId = "aaaaaaaa-0000-0000-0000-000000000001";
    const optionId = "opt-uuid-available";
    const displayName = "Alice Smith";

    it("upserts a system preset status and returns updated status with option", async () => {
      const option = makeStatusOption(); // user_id = null → system preset, no premium check
      const updatedStatus = makeStatus();

      statusOptionService.getStatusOptionById.mockResolvedValue(option);
      statusRepo.upsert.mockResolvedValue(undefined);
      statusRepo.findOne.mockResolvedValue(updatedStatus);
      connectionRepo.find.mockResolvedValue([]); // no connections → no push

      const result = await service.updateStatus(userId, optionId, displayName);

      expect(statusOptionService.getStatusOptionById).toHaveBeenCalledWith(optionId, userId);
      expect(statusRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: userId, option_id: optionId, note: null, expires_at: null }),
        ["user_id"],
      );
      expect(result.status).toBe(updatedStatus);
      expect(result.option).toBe(option);
    });

    it("includes note and expiresAt when provided", async () => {
      const option = makeStatusOption();
      const future = new Date(Date.now() + 60_000);
      const updatedStatus = makeStatus({ note: "Presenting", expires_at: future });

      statusOptionService.getStatusOptionById.mockResolvedValue(option);
      statusRepo.upsert.mockResolvedValue(undefined);
      statusRepo.findOne.mockResolvedValue(updatedStatus);
      connectionRepo.find.mockResolvedValue([]);

      const result = await service.updateStatus(userId, optionId, displayName, "Presenting", future);

      expect(statusRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ note: "Presenting", expires_at: future }),
        ["user_id"],
      );
      expect(result.status.note).toBe("Presenting");
      expect(result.status.expires_at).toBe(future);
    });

    it("throws BadRequestException when expiresAt is in the past", async () => {
      const option = makeStatusOption(); // system preset
      const pastDate = new Date(Date.now() - 60_000);

      statusOptionService.getStatusOptionById.mockResolvedValue(option);

      await expect(
        service.updateStatus(userId, optionId, displayName, undefined, pastDate),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when non-premium user tries a custom status (no premium_until)", async () => {
      const customOption = makeStatusOption({
        id: "opt-uuid-custom",
        user_id: userId, // custom — owned by this user
        label: "Gaming",
        emoji: "🎮",
      });
      const freeUser = makeUser({ premium_until: null });

      statusOptionService.getStatusOptionById.mockResolvedValue(customOption);
      userRepo.findOne.mockResolvedValue(freeUser);

      await expect(
        service.updateStatus(userId, customOption.id, displayName),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException and resets to default when premium expired beyond grace period", async () => {
      const customOption = makeStatusOption({
        id: "opt-uuid-custom",
        user_id: userId,
        label: "Gaming",
        emoji: "🎮",
      });
      // expired more than 3 days ago
      const expiredPremiumUntil = new Date(Date.now() - PREMIUM_GRACE_PERIOD_MS - 1000);
      const expiredUser = makeUser({ premium_until: expiredPremiumUntil });
      const defaultOption = makeStatusOption();

      statusOptionService.getStatusOptionById.mockResolvedValue(customOption);
      userRepo.findOne.mockResolvedValue(expiredUser);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(defaultOption);
      statusRepo.upsert.mockResolvedValue(undefined);
      const resetStatus = makeStatus({ option_id: defaultOption.id });
      statusRepo.findOne.mockResolvedValue(resetStatus);

      await expect(
        service.updateStatus(userId, customOption.id, displayName),
      ).rejects.toThrow(BadRequestException);

      // Should have upserted with default option
      expect(statusRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ option_id: defaultOption.id }),
        ["user_id"],
      );
    });

    it("allows custom status when premium is still within grace period", async () => {
      const customOption = makeStatusOption({
        id: "opt-uuid-custom",
        user_id: userId,
        label: "Gaming",
        emoji: "🎮",
      });
      // expired 1 day ago — still within 3-day grace period
      const gracePremiumUntil = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const graceUser = makeUser({ premium_until: gracePremiumUntil });
      const updatedStatus = makeStatus({ option_id: customOption.id, option: customOption });

      statusOptionService.getStatusOptionById.mockResolvedValue(customOption);
      userRepo.findOne.mockResolvedValue(graceUser);
      statusRepo.upsert.mockResolvedValue(undefined);
      statusRepo.findOne.mockResolvedValue(updatedStatus);
      connectionRepo.find.mockResolvedValue([]);

      const result = await service.updateStatus(userId, customOption.id, displayName);

      expect(result.option).toBe(customOption);
    });

    it("throws InternalServerErrorException when status reload returns null after upsert", async () => {
      const option = makeStatusOption();

      statusOptionService.getStatusOptionById.mockResolvedValue(option);
      statusRepo.upsert.mockResolvedValue(undefined);
      statusRepo.findOne.mockResolvedValue(null); // simulates DB failure to reload

      await expect(
        service.updateStatus(userId, optionId, displayName),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it("throws InternalServerErrorException when default option not found after premium expiry", async () => {
      const customOption = makeStatusOption({ id: "opt-custom", user_id: userId, label: "Busy" });
      const expiredUser = makeUser({
        premium_until: new Date(Date.now() - PREMIUM_GRACE_PERIOD_MS - 1000),
      });

      statusOptionService.getStatusOptionById.mockResolvedValue(customOption);
      userRepo.findOne.mockResolvedValue(expiredUser);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(null); // no default found

      await expect(
        service.updateStatus(userId, customOption.id, displayName),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it("still succeeds even if push notification fails (fire-and-forget)", async () => {
      const option = makeStatusOption();
      const updatedStatus = makeStatus();

      statusOptionService.getStatusOptionById.mockResolvedValue(option);
      statusRepo.upsert.mockResolvedValue(undefined);
      statusRepo.findOne.mockResolvedValue(updatedStatus);

      // Push path: connection exists, device token found, but sendEachAndCleanup throws
      const bobId = "bbbbbbbb-0000-0000-0000-000000000002";
      const conn = makeConnection({ a_shows_status: true, b_shows_status: true });
      connectionRepo.find.mockResolvedValue([conn]);
      deviceTokenRepo.find.mockResolvedValue([
        { id: "token-id-1", token: "fcm-token-bob", user_id: bobId, platform: "android" },
      ]);
      mockSendEach.mockRejectedValue(new Error("FCM unavailable"));

      // Should not throw despite push failure
      await expect(
        service.updateStatus(userId, optionId, displayName),
      ).resolves.toBeDefined();
    });
  });

  // =========================================================================
  // getUserStatus
  // =========================================================================

  describe("getUserStatus", () => {
    const userId = "aaaaaaaa-0000-0000-0000-000000000001";

    it("returns the current status with option loaded", async () => {
      const status = makeStatus();
      statusRepo.findOne.mockResolvedValue(status);

      const result = await service.getUserStatus(userId);

      expect(statusRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: userId },
        relations: ["option"],
      });
      expect(result).toBe(status);
    });

    it("returns null when user has no status yet", async () => {
      statusRepo.findOne.mockResolvedValue(null);

      const result = await service.getUserStatus(userId);

      expect(result).toBeNull();
    });

    it("corrects an expired status to the default option (lazy expiration check)", async () => {
      const defaultOption = makeStatusOption();
      const pastDate = new Date(Date.now() - 1000);
      const expiredStatus = makeStatus({ expires_at: pastDate });

      statusRepo.findOne.mockResolvedValue(expiredStatus);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(defaultOption);
      statusRepo.update.mockResolvedValue(undefined);

      const result = await service.getUserStatus(userId);

      // The option should be corrected in-memory to the default
      expect(result?.option).toBe(defaultOption);
      expect(result?.expires_at).toBeNull();
      expect(result?.note).toBeNull();
    });

    it("throws InternalServerErrorException when the repository throws", async () => {
      statusRepo.findOne.mockRejectedValue(new Error("DB connection lost"));

      await expect(service.getUserStatus(userId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // =========================================================================
  // getFriendsStatus
  // =========================================================================

  describe("getFriendsStatus", () => {
    const userId = "aaaaaaaa-0000-0000-0000-000000000001";
    const bobId = "bbbbbbbb-0000-0000-0000-000000000002";

    it("returns an empty array when user has no connections", async () => {
      connectionRepo.find.mockResolvedValue([]);

      const result = await service.getFriendsStatus(userId);

      expect(result).toEqual([]);
    });

    it("returns friend status when both sides show status", async () => {
      const defaultOption = makeStatusOption();
      const conn = makeConnection(); // a_shows_status & b_shows_status = true
      const bobStatus = makeStatus({
        user_id: bobId,
        user: conn.friend,
        option: makeStatusOption({ label: "Busy", emoji: "🔴" }),
      });

      connectionRepo.find.mockResolvedValue([conn]);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(defaultOption);
      // bulk expiry correction
      statusRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      });
      statusRepo.find.mockResolvedValue([bobStatus]);

      const result = await service.getFriendsStatus(userId);

      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe(bobId);
      expect(result[0].option?.label).toBe("Busy");
    });

    it("returns default status for a friend when visibility is off (a_shows_status = false)", async () => {
      const defaultOption = makeStatusOption();
      const conn = makeConnection({ a_shows_status: false, b_shows_status: true });

      connectionRepo.find.mockResolvedValue([conn]);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(defaultOption);
      statusRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      });
      statusRepo.find.mockResolvedValue([]);

      const result = await service.getFriendsStatus(userId);

      expect(result).toHaveLength(1);
      expect(result[0].option?.label).toBe("Available"); // default
      expect(result[0].note).toBeNull();
    });

    it("returns default status fallback when friend has no status record", async () => {
      const defaultOption = makeStatusOption();
      const conn = makeConnection(); // both sides visible

      connectionRepo.find.mockResolvedValue([conn]);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(defaultOption);
      statusRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      });
      statusRepo.find.mockResolvedValue([]); // bob has no status row

      const result = await service.getFriendsStatus(userId);

      expect(result).toHaveLength(1);
      expect(result[0].option?.id).toBe(defaultOption.id);
    });

    it("works correctly when user is the friend_id in the connection (reversed pair)", async () => {
      // Connection stored as (alice=user_id, bob=friend_id); requester is bob
      const bobUserId = "bbbbbbbb-0000-0000-0000-000000000002";
      const aliceId = "aaaaaaaa-0000-0000-0000-000000000001";
      const conn = makeConnection({
        user_id: aliceId,
        friend_id: bobUserId,
        user: makeUser({ id: aliceId }),
        friend: makeUser({ id: bobUserId, first_name: "Bob" }),
      });
      const defaultOption = makeStatusOption();
      const aliceStatus = makeStatus({ user_id: aliceId, user: makeUser({ id: aliceId }) });

      connectionRepo.find.mockResolvedValue([conn]);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(defaultOption);
      statusRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      });
      statusRepo.find.mockResolvedValue([aliceStatus]);

      const result = await service.getFriendsStatus(bobUserId);

      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe(aliceId);
    });

    it("throws InternalServerErrorException when connection repository throws", async () => {
      connectionRepo.find.mockRejectedValue(new Error("DB error"));

      await expect(service.getFriendsStatus(userId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

});
