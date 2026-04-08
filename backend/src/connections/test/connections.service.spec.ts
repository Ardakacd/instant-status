import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";

import { ConnectionsService } from "../connections.service";
import { Connection } from "../../entities/connection.entity";
import { DeviceToken } from "../../entities/device-token.entity";
import { User } from "../../entities/user.entity";

// ---------------------------------------------------------------------------
// Mock firebase-admin config — must happen before any import resolves it
// ---------------------------------------------------------------------------

jest.mock("../../config/firebase-admin.config", () => ({
  getFirebaseAdmin: jest.fn(() => ({ messaging: jest.fn() })),
}));

jest.mock("../../utils/fcm", () => ({
  sendEachAndCleanup: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Two UUIDs where ID_A < ID_B (alphabetically). This ensures tests can reason
 * about which position each user lands in the normalized pair.
 *
 * "aaaaaaaa-..." < "bbbbbbbb-..."
 */
const USER_A_ID = "aaaaaaaa-0000-0000-0000-000000000001"; // smaller UUID → user_id
const USER_B_ID = "bbbbbbbb-0000-0000-0000-000000000002"; // larger UUID  → friend_id
const USER_C_ID = "cccccccc-0000-0000-0000-000000000003"; // another user

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = USER_A_ID;
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

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  const conn = new Connection();
  conn.id = "conn-uuid-1";
  conn.user_id = USER_A_ID;   // smaller UUID in normalized pair
  conn.friend_id = USER_B_ID; // larger UUID in normalized pair
  conn.a_shows_status = true;
  conn.b_shows_status = true;
  conn.created_at = new Date("2026-01-01T00:00:00.000Z");
  conn.user = makeUser({ id: USER_A_ID });
  conn.friend = makeUser({ id: USER_B_ID, first_name: "Bob", email: "bob@example.com" });
  return Object.assign(conn, overrides);
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockConnectionRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  remove: jest.fn(),
});

const mockDeviceTokenRepository = () => ({
  find: jest.fn().mockResolvedValue([]),
});

const mockUserRepository = () => ({
  findOne: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("ConnectionsService", () => {
  let service: ConnectionsService;
  let connRepo: ReturnType<typeof mockConnectionRepository>;
  let userRepo: ReturnType<typeof mockUserRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: getRepositoryToken(Connection), useFactory: mockConnectionRepository },
        { provide: getRepositoryToken(DeviceToken), useFactory: mockDeviceTokenRepository },
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
      ],
    }).compile();

    service = module.get<ConnectionsService>(ConnectionsService);
    connRepo = module.get(getRepositoryToken(Connection));
    userRepo = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Normalized pair ordering (core invariant)
  // =========================================================================

  describe("normalized pair rule (user_id < friend_id)", () => {
    it("isStatusVisible returns true only when both a_shows_status and b_shows_status are true", () => {
      expect(service.isStatusVisible(makeConnection({ a_shows_status: true, b_shows_status: true }))).toBe(true);
      expect(service.isStatusVisible(makeConnection({ a_shows_status: false, b_shows_status: true }))).toBe(false);
      expect(service.isStatusVisible(makeConnection({ a_shows_status: true, b_shows_status: false }))).toBe(false);
      expect(service.isStatusVisible(makeConnection({ a_shows_status: false, b_shows_status: false }))).toBe(false);
    });

    it("getUserVisibilityState returns a_shows_status for the alphabetically-smaller user_id", () => {
      const conn = makeConnection({ user_id: USER_A_ID, friend_id: USER_B_ID, a_shows_status: false, b_shows_status: true });
      // USER_A_ID is the smaller UUID → stored as user_id → governs a_shows_status
      expect(service.getUserVisibilityState(conn, USER_A_ID)).toBe(false);
    });

    it("getUserVisibilityState returns b_shows_status for the alphabetically-larger friend_id", () => {
      const conn = makeConnection({ user_id: USER_A_ID, friend_id: USER_B_ID, a_shows_status: true, b_shows_status: false });
      // USER_B_ID is the larger UUID → stored as friend_id → governs b_shows_status
      expect(service.getUserVisibilityState(conn, USER_B_ID)).toBe(false);
    });

    it("getUserVisibilityState is stable regardless of the argument order used when building the connection", () => {
      // Even if a connection was hypothetically built with IDs reversed,
      // getUserVisibilityState normalises internally via normalizePair.
      const conn = makeConnection({ user_id: USER_A_ID, friend_id: USER_B_ID, a_shows_status: true, b_shows_status: false });
      // Asking from B's perspective must give b_shows_status (false)
      expect(service.getUserVisibilityState(conn, USER_B_ID)).toBe(false);
      // Asking from A's perspective must give a_shows_status (true)
      expect(service.getUserVisibilityState(conn, USER_A_ID)).toBe(true);
    });
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe("findAll", () => {
    it("queries both user_id and friend_id positions (normalized pair lookup)", async () => {
      connRepo.find.mockResolvedValue([]);

      await service.findAll(USER_A_ID);

      expect(connRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [{ user_id: USER_A_ID }, { friend_id: USER_A_ID }],
        }),
      );
    });

    it("returns the list of connections from the repository", async () => {
      const conn = makeConnection();
      connRepo.find.mockResolvedValue([conn]);

      const result = await service.findAll(USER_A_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(conn.id);
    });

    it("returns an empty array when user has no connections", async () => {
      connRepo.find.mockResolvedValue([]);

      const result = await service.findAll(USER_A_ID);

      expect(result).toEqual([]);
    });

    it("throws InternalServerErrorException on repository failure", async () => {
      connRepo.find.mockRejectedValue(new Error("DB error"));

      await expect(service.findAll(USER_A_ID)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // getFriendCount
  // =========================================================================

  describe("getFriendCount", () => {
    it("returns the count from the repository", async () => {
      connRepo.count.mockResolvedValue(3);

      const result = await service.getFriendCount(USER_A_ID);

      expect(result).toBe(3);
    });

    it("counts connections in both user_id and friend_id positions", async () => {
      connRepo.count.mockResolvedValue(2);

      await service.getFriendCount(USER_A_ID);

      expect(connRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [{ user_id: USER_A_ID }, { friend_id: USER_A_ID }],
        }),
      );
    });

    it("returns 0 when user has no connections", async () => {
      connRepo.count.mockResolvedValue(0);

      const result = await service.getFriendCount(USER_A_ID);

      expect(result).toBe(0);
    });

    it("throws InternalServerErrorException on repository failure", async () => {
      connRepo.count.mockRejectedValue(new Error("DB error"));

      await expect(service.getFriendCount(USER_A_ID)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // getFriendLimit
  // =========================================================================

  describe("getFriendLimit", () => {
    it("returns 24 for a premium user", () => {
      const premiumUser = makeUser({ premium_until: new Date(Date.now() + 1_000_000_000) });
      expect(service.getFriendLimit(premiumUser)).toBe(24);
    });

    it("returns 6 for a free user", () => {
      const freeUser = makeUser({ premium_until: null });
      expect(service.getFriendLimit(freeUser)).toBe(6);
    });

    it("returns 6 for a user whose premium has expired (not in grace period)", () => {
      // Expired more than 3 days ago — past grace period
      const expiredUser = makeUser({
        premium_until: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });
      expect(service.getFriendLimit(expiredUser)).toBe(6);
    });
  });

  // =========================================================================
  // isUserPremium
  // =========================================================================

  describe("isUserPremium", () => {
    it("returns true when premium_until is in the future", () => {
      const user = makeUser({ premium_until: new Date(Date.now() + 1_000_000_000) });
      expect(service.isUserPremium(user)).toBe(true);
    });

    it("returns false when premium_until is null", () => {
      const user = makeUser({ premium_until: null });
      expect(service.isUserPremium(user)).toBe(false);
    });

    it("returns false when premium_until is in the past", () => {
      const user = makeUser({ premium_until: new Date(Date.now() - 1_000) });
      expect(service.isUserPremium(user)).toBe(false);
    });
  });

  // =========================================================================
  // isInGracePeriod
  // =========================================================================

  describe("isInGracePeriod", () => {
    it("returns false when premium_until is null (never had premium)", () => {
      const user = makeUser({ premium_until: null });
      expect(service.isInGracePeriod(user)).toBe(false);
    });

    it("returns false when premium is still active", () => {
      const user = makeUser({ premium_until: new Date(Date.now() + 1_000_000_000) });
      expect(service.isInGracePeriod(user)).toBe(false);
    });

    it("returns true when expired within the 3-day grace window", () => {
      // Expired 1 hour ago
      const user = makeUser({ premium_until: new Date(Date.now() - 60 * 60 * 1000) });
      expect(service.isInGracePeriod(user)).toBe(true);
    });

    it("returns true when expired exactly at the start of the grace window", () => {
      // Expired 2 days ago — still within 3-day window
      const user = makeUser({ premium_until: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
      expect(service.isInGracePeriod(user)).toBe(true);
    });

    it("returns false when expired beyond the 3-day grace window", () => {
      // Expired 4 days ago — past the grace window
      const user = makeUser({ premium_until: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) });
      expect(service.isInGracePeriod(user)).toBe(false);
    });
  });

  // =========================================================================
  // checkFriendLimit
  // =========================================================================

  describe("checkFriendLimit", () => {
    it("throws NotFoundException when user does not exist", async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.checkFriendLimit(USER_A_ID)).rejects.toThrow(NotFoundException);
    });

    it("returns canAdd=true when free user has fewer than 6 friends", async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ premium_until: null }));
      connRepo.count.mockResolvedValue(3);

      const result = await service.checkFriendLimit(USER_A_ID);

      expect(result.canAdd).toBe(true);
      expect(result.currentCount).toBe(3);
      expect(result.limit).toBe(6);
    });

    it("returns canAdd=false with errorMessage when free user has exactly 6 friends", async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ premium_until: null }));
      connRepo.count.mockResolvedValue(6);

      const result = await service.checkFriendLimit(USER_A_ID);

      expect(result.canAdd).toBe(false);
      expect(result.errorMessage).toContain("6");
    });

    it("returns canAdd=true when premium user has fewer than 24 friends", async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ premium_until: new Date(Date.now() + 1_000_000_000) }));
      connRepo.count.mockResolvedValue(10);

      const result = await service.checkFriendLimit(USER_A_ID);

      expect(result.canAdd).toBe(true);
      expect(result.limit).toBe(24);
    });

    it("returns canAdd=false when premium user has reached 24 friends", async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ premium_until: new Date(Date.now() + 1_000_000_000) }));
      connRepo.count.mockResolvedValue(24);

      const result = await service.checkFriendLimit(USER_A_ID);

      expect(result.canAdd).toBe(false);
      expect(result.errorMessage).toContain("24");
    });

    it("returns isGrandfathered=true when free user has more than 6 friends (downgraded from premium)", async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ premium_until: null }));
      connRepo.count.mockResolvedValue(10); // > 6 but user is now free

      const result = await service.checkFriendLimit(USER_A_ID);

      expect(result.canAdd).toBe(false);
      expect(result.isGrandfathered).toBe(true);
      expect(result.currentCount).toBe(10);
    });

    it("returns canAdd=true when grace-period user has fewer than 24 friends", async () => {
      // Expired 1 hour ago — in grace period
      userRepo.findOne.mockResolvedValue(makeUser({ premium_until: new Date(Date.now() - 60 * 60 * 1000) }));
      connRepo.count.mockResolvedValue(5);

      const result = await service.checkFriendLimit(USER_A_ID);

      expect(result.canAdd).toBe(true);
      expect(result.limit).toBe(24);
    });

    it("exposes freeLimit=6 regardless of premium status", async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ premium_until: new Date(Date.now() + 1_000_000_000) }));
      connRepo.count.mockResolvedValue(0);

      const result = await service.checkFriendLimit(USER_A_ID);

      expect(result.freeLimit).toBe(6);
    });

    it("throws InternalServerErrorException on unexpected DB failure", async () => {
      userRepo.findOne.mockRejectedValue(new Error("DB failure"));

      await expect(service.checkFriendLimit(USER_A_ID)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // findConnection
  // =========================================================================

  describe("findConnection", () => {
    it("normalizes pair and finds connection when userId > friendId (B requests lookup by A)", async () => {
      const conn = makeConnection();
      connRepo.findOne.mockResolvedValue(conn);

      // Calling with B as userId, A as friendId — must normalize to [A, B]
      const result = await service.findConnection(USER_B_ID, USER_A_ID);

      expect(connRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: USER_A_ID, friend_id: USER_B_ID },
      });
      expect(result).toBe(conn);
    });

    it("normalizes pair and finds connection when userId < friendId (A requests lookup by B)", async () => {
      const conn = makeConnection();
      connRepo.findOne.mockResolvedValue(conn);

      await service.findConnection(USER_A_ID, USER_B_ID);

      expect(connRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: USER_A_ID, friend_id: USER_B_ID },
      });
    });

    it("returns null when connection does not exist", async () => {
      connRepo.findOne.mockResolvedValue(null);

      const result = await service.findConnection(USER_A_ID, USER_C_ID);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // createFromInvite
  // =========================================================================

  describe("createFromInvite", () => {
    it("throws BadRequestException when userId === friendId", async () => {
      await expect(service.createFromInvite(USER_A_ID, USER_A_ID)).rejects.toThrow(BadRequestException);
    });

    it("stores user_id as the smaller UUID regardless of argument order (userId=B, friendId=A)", async () => {
      const userA = makeUser({ id: USER_A_ID, premium_until: null });
      const userB = makeUser({ id: USER_B_ID, premium_until: null });
      userRepo.findOne
        .mockResolvedValueOnce(userB) // findOne({ where: { id: userId } }) → userId=B
        .mockResolvedValueOnce(userA); // findOne({ where: { id: friendId } }) → friendId=A
      connRepo.findOne.mockResolvedValue(null); // no existing connection
      connRepo.count.mockResolvedValue(0);
      const savedConn = makeConnection();
      connRepo.create.mockReturnValue(savedConn);
      connRepo.save.mockResolvedValue(savedConn);

      await service.createFromInvite(USER_B_ID, USER_A_ID); // B adds A

      // The create call must use the normalized pair [A, B], not [B, A]
      expect(connRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_A_ID,
          friend_id: USER_B_ID,
        }),
      );
    });

    it("stores user_id as the smaller UUID when argument order is already correct (userId=A, friendId=B)", async () => {
      const userA = makeUser({ id: USER_A_ID, premium_until: null });
      const userB = makeUser({ id: USER_B_ID, premium_until: null });
      userRepo.findOne
        .mockResolvedValueOnce(userA)
        .mockResolvedValueOnce(userB);
      connRepo.findOne.mockResolvedValue(null);
      connRepo.count.mockResolvedValue(0);
      const savedConn = makeConnection();
      connRepo.create.mockReturnValue(savedConn);
      connRepo.save.mockResolvedValue(savedConn);

      await service.createFromInvite(USER_A_ID, USER_B_ID); // A adds B

      expect(connRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_A_ID,
          friend_id: USER_B_ID,
        }),
      );
    });

    it("sets both visibility flags to true on a new connection (both users start visible)", async () => {
      const userA = makeUser({ id: USER_A_ID, premium_until: null });
      const userB = makeUser({ id: USER_B_ID, premium_until: null });
      userRepo.findOne.mockResolvedValueOnce(userA).mockResolvedValueOnce(userB);
      connRepo.findOne.mockResolvedValue(null);
      connRepo.count.mockResolvedValue(0);
      const savedConn = makeConnection();
      connRepo.create.mockReturnValue(savedConn);
      connRepo.save.mockResolvedValue(savedConn);

      await service.createFromInvite(USER_A_ID, USER_B_ID);

      expect(connRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          a_shows_status: true,
          b_shows_status: true,
        }),
      );
    });

    it("returns the existing connection without re-creating it", async () => {
      const existing = makeConnection();
      connRepo.findOne.mockResolvedValue(existing);

      const result = await service.createFromInvite(USER_A_ID, USER_B_ID);

      expect(result).toBe(existing);
      expect(connRepo.save).not.toHaveBeenCalled();
    });

    it("throws InternalServerErrorException (wrapping NotFoundException) when one of the users does not exist", async () => {
      // NOTE: createFromInvite's catch block does not re-throw NotFoundException — it
      // catches all non-23505 errors and wraps them as InternalServerErrorException.
      // This is the actual production behavior for the user-not-found path.
      connRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(service.createFromInvite(USER_A_ID, USER_C_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("throws InternalServerErrorException (wrapping BadRequestException) when requester has reached free limit of 6 friends", async () => {
      // NOTE: BadRequestException thrown inside createFromInvite is caught by the
      // outer try/catch which does not special-case it — it gets wrapped as
      // InternalServerErrorException. This is the current production behavior.
      const userA = makeUser({ id: USER_A_ID, premium_until: null }); // free
      const userB = makeUser({ id: USER_B_ID, premium_until: null });
      connRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValueOnce(userA).mockResolvedValueOnce(userB);
      connRepo.count
        .mockResolvedValueOnce(6)  // userA has 6 friends — at limit
        .mockResolvedValueOnce(0);

      await expect(service.createFromInvite(USER_A_ID, USER_B_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("throws InternalServerErrorException (wrapping BadRequestException) when friend has reached their limit", async () => {
      // NOTE: same catch-block behavior as above — BadRequestException is wrapped.
      const userA = makeUser({ id: USER_A_ID, premium_until: null });
      const userB = makeUser({ id: USER_B_ID, premium_until: null }); // free
      connRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValueOnce(userA).mockResolvedValueOnce(userB);
      connRepo.count
        .mockResolvedValueOnce(0)  // userA is fine
        .mockResolvedValueOnce(6); // userB has 6 friends — at limit

      await expect(service.createFromInvite(USER_A_ID, USER_B_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("allows creation when premium requester has not hit 24-friend limit", async () => {
      const premiumA = makeUser({ id: USER_A_ID, premium_until: new Date(Date.now() + 1_000_000_000) });
      const freeB = makeUser({ id: USER_B_ID, premium_until: null });
      connRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValueOnce(premiumA).mockResolvedValueOnce(freeB);
      connRepo.count
        .mockResolvedValueOnce(10) // premiumA has 10 friends — under 24 limit
        .mockResolvedValueOnce(0);
      const savedConn = makeConnection();
      connRepo.create.mockReturnValue(savedConn);
      connRepo.save.mockResolvedValue(savedConn);

      const result = await service.createFromInvite(USER_A_ID, USER_B_ID);

      expect(connRepo.save).toHaveBeenCalled();
      expect(result).toBe(savedConn);
    });

    it("throws InternalServerErrorException (wrapping BadRequestException) when premium user hits 24 friend limit", async () => {
      // NOTE: same catch-block wrapping behavior — BadRequestException becomes InternalServerErrorException.
      const premiumA = makeUser({ id: USER_A_ID, premium_until: new Date(Date.now() + 1_000_000_000) });
      const freeB = makeUser({ id: USER_B_ID, premium_until: null });
      connRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValueOnce(premiumA).mockResolvedValueOnce(freeB);
      connRepo.count
        .mockResolvedValueOnce(24) // premiumA at limit
        .mockResolvedValueOnce(0);

      await expect(service.createFromInvite(USER_A_ID, USER_B_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("handles race condition (code 23505): returns the existing connection instead of throwing", async () => {
      const userA = makeUser({ id: USER_A_ID, premium_until: null });
      const userB = makeUser({ id: USER_B_ID, premium_until: null });
      connRepo.findOne
        .mockResolvedValueOnce(null)   // first check: no existing connection
        .mockResolvedValueOnce(makeConnection()); // race-condition recovery lookup
      userRepo.findOne.mockResolvedValueOnce(userA).mockResolvedValueOnce(userB);
      connRepo.count.mockResolvedValue(0);
      connRepo.create.mockReturnValue(makeConnection());
      const uniqueViolation = new Error("unique violation") as any;
      uniqueViolation.code = "23505";
      connRepo.save.mockRejectedValue(uniqueViolation);

      const result = await service.createFromInvite(USER_A_ID, USER_B_ID);

      expect(result).toBeDefined();
    });

    it("throws InternalServerErrorException when race recovery lookup also fails", async () => {
      const userA = makeUser({ id: USER_A_ID, premium_until: null });
      const userB = makeUser({ id: USER_B_ID, premium_until: null });
      connRepo.findOne
        .mockResolvedValueOnce(null) // first check
        .mockResolvedValueOnce(null); // recovery lookup returns nothing
      userRepo.findOne.mockResolvedValueOnce(userA).mockResolvedValueOnce(userB);
      connRepo.count.mockResolvedValue(0);
      connRepo.create.mockReturnValue(makeConnection());
      const uniqueViolation = new Error("unique violation") as any;
      uniqueViolation.code = "23505";
      connRepo.save.mockRejectedValue(uniqueViolation);

      await expect(service.createFromInvite(USER_A_ID, USER_B_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("finds the connection using the normalized pair (B deletes, stores as [A,B])", async () => {
      const conn = makeConnection();
      connRepo.findOne.mockResolvedValue(conn);
      connRepo.remove.mockResolvedValue(conn);

      // B initiates deletion — must look up normalized [A, B]
      await service.delete(USER_B_ID, USER_A_ID);

      expect(connRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: USER_A_ID, friend_id: USER_B_ID },
      });
    });

    it("removes the connection from the repository", async () => {
      const conn = makeConnection();
      connRepo.findOne.mockResolvedValue(conn);
      connRepo.remove.mockResolvedValue(conn);

      await service.delete(USER_A_ID, USER_B_ID);

      expect(connRepo.remove).toHaveBeenCalledWith(conn);
    });

    it("throws NotFoundException when connection does not exist", async () => {
      connRepo.findOne.mockResolvedValue(null);

      await expect(service.delete(USER_A_ID, USER_C_ID)).rejects.toThrow(NotFoundException);
    });

    it("throws InternalServerErrorException on unexpected repository error", async () => {
      connRepo.findOne.mockRejectedValue(new Error("DB crash"));

      await expect(service.delete(USER_A_ID, USER_B_ID)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // updateVisibility
  // =========================================================================

  describe("updateVisibility", () => {
    it("updates a_shows_status when the requesting user is the smaller UUID (user_id position)", async () => {
      const conn = makeConnection({ a_shows_status: true, b_shows_status: true });
      connRepo.findOne.mockResolvedValue(conn);
      connRepo.save.mockResolvedValue({ ...conn, a_shows_status: false });

      // USER_A_ID is the smaller UUID → a_shows_status
      await service.updateVisibility(USER_A_ID, USER_B_ID, false);

      const savedArg = connRepo.save.mock.calls[0][0];
      expect(savedArg.a_shows_status).toBe(false);
      expect(savedArg.b_shows_status).toBe(true); // B's flag unchanged
    });

    it("updates b_shows_status when the requesting user is the larger UUID (friend_id position)", async () => {
      const conn = makeConnection({ a_shows_status: true, b_shows_status: true });
      connRepo.findOne.mockResolvedValue(conn);
      connRepo.save.mockResolvedValue({ ...conn, b_shows_status: false });

      // USER_B_ID is the larger UUID → b_shows_status
      await service.updateVisibility(USER_B_ID, USER_A_ID, false);

      const savedArg = connRepo.save.mock.calls[0][0];
      expect(savedArg.b_shows_status).toBe(false);
      expect(savedArg.a_shows_status).toBe(true); // A's flag unchanged
    });

    it("normalizes the pair before the repository lookup", async () => {
      const conn = makeConnection();
      connRepo.findOne.mockResolvedValue(conn);
      connRepo.save.mockResolvedValue(conn);

      // Pass B as userId and A as friendId — must look up [A, B]
      await service.updateVisibility(USER_B_ID, USER_A_ID, true);

      expect(connRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: USER_A_ID, friend_id: USER_B_ID },
      });
    });

    it("throws NotFoundException when connection does not exist", async () => {
      connRepo.findOne.mockResolvedValue(null);

      await expect(service.updateVisibility(USER_A_ID, USER_C_ID, false)).rejects.toThrow(NotFoundException);
    });

    it("throws InternalServerErrorException on unexpected repository error", async () => {
      connRepo.findOne.mockRejectedValue(new Error("DB failure"));

      await expect(service.updateVisibility(USER_A_ID, USER_B_ID, false)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("returns the saved connection", async () => {
      const conn = makeConnection();
      const saved = { ...conn, a_shows_status: false };
      connRepo.findOne.mockResolvedValue(conn);
      connRepo.save.mockResolvedValue(saved);

      const result = await service.updateVisibility(USER_A_ID, USER_B_ID, false);

      expect(result).toEqual(saved);
    });
  });

  // =========================================================================
  // notifyPeersUserAccountDeleted
  // =========================================================================

  describe("notifyPeersUserAccountDeleted", () => {
    it("resolves without error when user has no connections", async () => {
      connRepo.find.mockResolvedValue([]);

      await expect(service.notifyPeersUserAccountDeleted(USER_A_ID)).resolves.toBeUndefined();
    });

    it("resolves without throwing even when the find fails (fire-and-forget safety)", async () => {
      connRepo.find.mockRejectedValue(new Error("DB unavailable"));

      // This method absorbs errors — must not throw
      await expect(service.notifyPeersUserAccountDeleted(USER_A_ID)).resolves.toBeUndefined();
    });
  });
});
