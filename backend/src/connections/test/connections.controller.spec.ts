import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ExecutionContext } from "@nestjs/common";

import { ConnectionsController } from "../connections.controller";
import { ConnectionsService } from "../connections.service";
import { UserService } from "../../user/user.service";
import { AuthGuard } from "../../auth/auth.guard";
import { Connection } from "../../entities/connection.entity";
import { User } from "../../entities/user.entity";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Two UUIDs that satisfy the normalized pair rule: USER_A_ID < USER_B_ID
 * (alphabetical sort). This ensures helper functions produce deterministic
 * normalized-pair ordering.
 */
const USER_A_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B_ID = "bbbbbbbb-0000-0000-0000-000000000002";

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
  conn.user_id = USER_A_ID;
  conn.friend_id = USER_B_ID;
  conn.a_shows_status = true;
  conn.b_shows_status = true;
  conn.created_at = new Date("2026-01-01T00:00:00.000Z");
  conn.user = makeUser({ id: USER_A_ID });
  conn.friend = makeUser({ id: USER_B_ID, first_name: "Bob", email: "bob@example.com" });
  return Object.assign(conn, overrides);
}

// Mock AuthGuard that passes all requests through and attaches a default user.
const mockAuthGuard = {
  canActivate: jest.fn((ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = makeUser();
    return true;
  }),
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockConnectionsService = () => ({
  findAll: jest.fn(),
  isStatusVisible: jest.fn(),
  getUserVisibilityState: jest.fn(),
  checkFriendLimit: jest.fn(),
  delete: jest.fn(),
  updateVisibility: jest.fn(),
});

const mockUserService = () => ({
  findById: jest.fn(),
  update: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("ConnectionsController", () => {
  let controller: ConnectionsController;
  let connectionsService: ReturnType<typeof mockConnectionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionsController],
      providers: [
        { provide: ConnectionsService, useFactory: mockConnectionsService },
        { provide: UserService, useFactory: mockUserService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<ConnectionsController>(ConnectionsController);
    connectionsService = module.get(ConnectionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // GET /connections
  // =========================================================================

  describe("GET /connections – getConnections", () => {
    it("returns a mapped list of connections for the authenticated user", async () => {
      const conn = makeConnection();
      connectionsService.findAll.mockResolvedValue([conn]);
      connectionsService.isStatusVisible.mockReturnValue(true);
      connectionsService.getUserVisibilityState.mockReturnValue(true);

      const user = makeUser();
      const result = await controller.getConnections({ user });

      expect(connectionsService.findAll).toHaveBeenCalledWith(user.id);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(conn.id);
    });

    it("exposes friend_id, friend_first_name, and friend_last_name from the correct side of the connection", async () => {
      // When req.user is the user_id side of the connection, the friend is conn.friend
      const alice = makeUser({ id: USER_A_ID, first_name: "Alice" });
      const conn = makeConnection();
      conn.user = alice;
      conn.friend = makeUser({ id: USER_B_ID, first_name: "Bob", last_name: "Jones" });

      connectionsService.findAll.mockResolvedValue([conn]);
      connectionsService.isStatusVisible.mockReturnValue(true);
      connectionsService.getUserVisibilityState.mockReturnValue(true);

      const result = await controller.getConnections({ user: alice });

      expect(result[0].friend_id).toBe(USER_B_ID);
      expect(result[0].friend_first_name).toBe("Bob");
      expect(result[0].friend_last_name).toBe("Jones");
    });

    it("uses conn.user as the friend when req.user matches conn.friend_id (B's perspective)", async () => {
      // Bob (USER_B_ID) is the friend_id side — so from his perspective, the
      // friend entry is conn.user (Alice).
      const bob = makeUser({ id: USER_B_ID, first_name: "Bob" });
      const conn = makeConnection();
      conn.user = makeUser({ id: USER_A_ID, first_name: "Alice", last_name: "Smith" });
      conn.friend = bob;

      connectionsService.findAll.mockResolvedValue([conn]);
      connectionsService.isStatusVisible.mockReturnValue(true);
      connectionsService.getUserVisibilityState.mockReturnValue(true);

      const result = await controller.getConnections({ user: bob });

      expect(result[0].friend_id).toBe(USER_A_ID);
      expect(result[0].friend_first_name).toBe("Alice");
    });

    it("includes visibility and user_shows_status in each connection entry", async () => {
      const conn = makeConnection();
      connectionsService.findAll.mockResolvedValue([conn]);
      connectionsService.isStatusVisible.mockReturnValue(false);
      connectionsService.getUserVisibilityState.mockReturnValue(false);

      const user = makeUser();
      const result = await controller.getConnections({ user });

      expect(result[0]).toMatchObject({
        visibility: false,
        user_shows_status: false,
      });
    });

    it("returns an empty array when user has no connections", async () => {
      connectionsService.findAll.mockResolvedValue([]);

      const result = await controller.getConnections({ user: makeUser() });

      expect(result).toEqual([]);
    });

    it("propagates errors thrown by ConnectionsService.findAll", async () => {
      connectionsService.findAll.mockRejectedValue(new Error("DB failure"));

      await expect(controller.getConnections({ user: makeUser() })).rejects.toThrow("DB failure");
    });

    it("is protected by AuthGuard (guard metadata is applied)", () => {
      const guards: any[] =
        Reflect.getMetadata("__guards__", ConnectionsController) ?? [];
      const guardTokens = guards.map((g) =>
        typeof g === "function" ? g : g?.constructor,
      );
      expect(guardTokens).toContain(AuthGuard);
    });
  });

  // =========================================================================
  // GET /connections/friend-count
  // =========================================================================

  describe("GET /connections/friend-count – getFriendCount", () => {
    it("returns count, limit, canAddMore, and isGrandfathered from checkFriendLimit", async () => {
      connectionsService.checkFriendLimit.mockResolvedValue({
        currentCount: 3,
        limit: 6,
        freeLimit: 6,
        canAdd: true,
        isGrandfathered: false,
        errorMessage: undefined,
      });

      const result = await controller.getFriendCount({ user: makeUser() });

      expect(result).toMatchObject({
        count: 3,
        limit: 6,
        freeLimit: 6,
        canAddMore: true,
        isGrandfathered: false,
      });
    });

    it("defaults isGrandfathered to false when undefined in service result", async () => {
      connectionsService.checkFriendLimit.mockResolvedValue({
        currentCount: 0,
        limit: 6,
        freeLimit: 6,
        canAdd: true,
      });

      const result = await controller.getFriendCount({ user: makeUser() });

      expect(result.isGrandfathered).toBe(false);
    });

    it("passes the authenticated user id to checkFriendLimit", async () => {
      connectionsService.checkFriendLimit.mockResolvedValue({
        currentCount: 0,
        limit: 6,
        freeLimit: 6,
        canAdd: true,
      });

      const user = makeUser({ id: USER_A_ID });
      await controller.getFriendCount({ user });

      expect(connectionsService.checkFriendLimit).toHaveBeenCalledWith(USER_A_ID);
    });

    it("propagates errors from checkFriendLimit", async () => {
      connectionsService.checkFriendLimit.mockRejectedValue(new Error("service error"));

      await expect(controller.getFriendCount({ user: makeUser() })).rejects.toThrow("service error");
    });
  });

  // =========================================================================
  // DELETE /connections/:friend_id
  // =========================================================================

  describe("DELETE /connections/:friend_id – deleteConnection", () => {
    it("calls ConnectionsService.delete with the authenticated user id and parsed friend id", async () => {
      connectionsService.delete.mockResolvedValue(undefined);

      const user = makeUser({ id: USER_A_ID });
      await controller.deleteConnection({ user }, USER_B_ID);

      expect(connectionsService.delete).toHaveBeenCalledWith(USER_A_ID, USER_B_ID);
    });

    it("returns { message: 'Connection removed' } on success", async () => {
      connectionsService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteConnection({ user: makeUser() }, USER_B_ID);

      expect(result).toEqual({ message: "Connection removed" });
    });

    it("throws ZodError when friend_id is not a valid UUID", async () => {
      await expect(
        controller.deleteConnection({ user: makeUser() }, "not-a-uuid"),
      ).rejects.toThrow();
    });

    it("propagates NotFoundException from ConnectionsService.delete", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      connectionsService.delete.mockRejectedValue(new NotFoundException("Connection not found"));

      await expect(
        controller.deleteConnection({ user: makeUser() }, USER_B_ID),
      ).rejects.toThrow("Connection not found");
    });
  });

  // =========================================================================
  // PATCH /connections/:friend_id/visibility
  // =========================================================================

  describe("PATCH /connections/:friend_id/visibility – updateVisibility", () => {
    it("calls ConnectionsService.updateVisibility with correct args when shows_status=false", async () => {
      connectionsService.updateVisibility.mockResolvedValue(makeConnection());

      const user = makeUser({ id: USER_A_ID });
      await controller.updateVisibility({ user }, USER_B_ID, { shows_status: false });

      expect(connectionsService.updateVisibility).toHaveBeenCalledWith(USER_A_ID, USER_B_ID, false);
    });

    it("calls ConnectionsService.updateVisibility with shows_status=true", async () => {
      connectionsService.updateVisibility.mockResolvedValue(makeConnection());

      const user = makeUser({ id: USER_A_ID });
      await controller.updateVisibility({ user }, USER_B_ID, { shows_status: true });

      expect(connectionsService.updateVisibility).toHaveBeenCalledWith(USER_A_ID, USER_B_ID, true);
    });

    it("returns { message: 'Visibility updated' } on success", async () => {
      connectionsService.updateVisibility.mockResolvedValue(makeConnection());

      const result = await controller.updateVisibility(
        { user: makeUser() },
        USER_B_ID,
        { shows_status: true },
      );

      expect(result).toEqual({ message: "Visibility updated" });
    });

    it("throws ZodError when friend_id is not a valid UUID", async () => {
      await expect(
        controller.updateVisibility({ user: makeUser() }, "invalid", { shows_status: true }),
      ).rejects.toThrow();
    });

    it("throws ZodError when shows_status is missing from body", async () => {
      await expect(
        controller.updateVisibility({ user: makeUser() }, USER_B_ID, {} as any),
      ).rejects.toThrow();
    });

    it("throws ZodError when body contains unknown fields (strict schema)", async () => {
      await expect(
        controller.updateVisibility(
          { user: makeUser() },
          USER_B_ID,
          { shows_status: true, extra_field: "forbidden" } as any,
        ),
      ).rejects.toThrow();
    });

    it("propagates NotFoundException from ConnectionsService.updateVisibility", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      connectionsService.updateVisibility.mockRejectedValue(
        new NotFoundException("Connection not found"),
      );

      await expect(
        controller.updateVisibility({ user: makeUser() }, USER_B_ID, { shows_status: false }),
      ).rejects.toThrow("Connection not found");
    });
  });
});
