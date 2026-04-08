import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";

import { InviteCodeService } from "../invite-code.service";
import { InviteCode } from "../../entities/invite-code.entity";
import { User } from "../../entities/user.entity";
import { ConnectionsService } from "../../connections/connections.service";
import { DataSource } from "typeorm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeInviteCode(overrides: Partial<InviteCode> = {}): InviteCode {
  const invite = new InviteCode();
  invite.id = "invite-uuid-1";
  invite.code = "ABCD1234";
  invite.owner_user_id = USER_A_ID;
  invite.created_at = new Date("2026-01-01T00:00:00.000Z");
  invite.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
  invite.used_by_user_id = null;
  invite.used_at = null;
  invite.owner = makeUser({ id: USER_A_ID });
  invite.usedBy = null;
  return Object.assign(invite, overrides);
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockInviteCodeRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

const mockUserRepository = () => ({
  findOne: jest.fn(),
});

const mockConnectionsService = () => ({
  createFromInvite: jest.fn(),
  findConnection: jest.fn(),
});

// ---------------------------------------------------------------------------
// DataSource transaction mock
// ---------------------------------------------------------------------------

/**
 * Creates a mock DataSource whose transaction() method immediately calls the
 * callback with a mock EntityManager.
 */
function makeMockDataSource(managerOverrides: Record<string, any> = {}) {
  const mockManager = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...managerOverrides,
  };

  const dataSource = {
    transaction: jest.fn((cb: (m: any) => any) => cb(mockManager)),
  };

  return { dataSource, mockManager };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("InviteCodeService", () => {
  let service: InviteCodeService;
  let inviteCodeRepo: ReturnType<typeof mockInviteCodeRepository>;
  let userRepo: ReturnType<typeof mockUserRepository>;
  let connectionsService: ReturnType<typeof mockConnectionsService>;
  let dataSource: { transaction: jest.Mock };
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    const { dataSource: ds, mockManager: mm } = makeMockDataSource();
    dataSource = ds;
    mockManager = mm;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteCodeService,
        { provide: getRepositoryToken(InviteCode), useFactory: mockInviteCodeRepository },
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        { provide: ConnectionsService, useFactory: mockConnectionsService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<InviteCodeService>(InviteCodeService);
    inviteCodeRepo = module.get(getRepositoryToken(InviteCode));
    userRepo = module.get(getRepositoryToken(User));
    connectionsService = module.get(ConnectionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // generateCode
  // =========================================================================

  describe("generateCode", () => {
    it("returns existing unexpired unused code when no custom expiration given", async () => {
      const existing = makeInviteCode();
      inviteCodeRepo.findOne.mockResolvedValue(existing);

      const result = await service.generateCode(USER_A_ID);

      expect(result).toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("creates a new code via transaction when no existing code found (default expiration)", async () => {
      const newCode = makeInviteCode();
      inviteCodeRepo.findOne.mockResolvedValue(null);
      mockManager.create.mockReturnValue(newCode);
      mockManager.save.mockResolvedValue(newCode);

      const result = await service.generateCode(USER_A_ID);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockManager.create).toHaveBeenCalledWith(
        InviteCode,
        expect.objectContaining({ owner_user_id: USER_A_ID }),
      );
      expect(result).toBe(newCode);
    });

    it("skips the existing-code lookup when a custom expiration is specified", async () => {
      const newCode = makeInviteCode();
      mockManager.create.mockReturnValue(newCode);
      mockManager.save.mockResolvedValue(newCode);

      await service.generateCode(USER_A_ID, 48);

      expect(inviteCodeRepo.findOne).not.toHaveBeenCalled();
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it("throws BadRequestException when expiresInHours is 0", async () => {
      await expect(service.generateCode(USER_A_ID, 0)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when expiresInHours is negative", async () => {
      await expect(service.generateCode(USER_A_ID, -5)).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when expiresInHours exceeds 8760 (1 year)", async () => {
      await expect(service.generateCode(USER_A_ID, 8761)).rejects.toThrow(BadRequestException);
    });

    it("accepts exactly 8760 hours as a valid expiration", async () => {
      const newCode = makeInviteCode();
      mockManager.create.mockReturnValue(newCode);
      mockManager.save.mockResolvedValue(newCode);

      await expect(service.generateCode(USER_A_ID, 8760)).resolves.toBeDefined();
    });

    it("sets expires_at approximately 24h from now when no expiration given", async () => {
      inviteCodeRepo.findOne.mockResolvedValue(null);
      const before = Date.now();
      const newCode = makeInviteCode();
      mockManager.create.mockImplementation((_entity, data) => ({ ...newCode, ...data }));
      mockManager.save.mockImplementation((inv) => Promise.resolve(inv));

      const result = await service.generateCode(USER_A_ID);

      const after = Date.now();
      const expectedMin = before + 24 * 60 * 60 * 1000 - 1000;
      const expectedMax = after + 24 * 60 * 60 * 1000 + 1000;
      expect(result.expires_at.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expires_at.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it("retries on unique code collision (error code 23505) and succeeds on second attempt", async () => {
      const newCode = makeInviteCode({ code: "ZZZZ9999" });
      inviteCodeRepo.findOne.mockResolvedValue(null);

      const uniqueViolation = new Error("unique_violation") as any;
      uniqueViolation.code = "23505";

      mockManager.create.mockReturnValue(newCode);
      mockManager.save
        .mockRejectedValueOnce(uniqueViolation) // first attempt: collision
        .mockResolvedValueOnce(newCode);         // second attempt: success

      const result = await service.generateCode(USER_A_ID);

      expect(mockManager.save).toHaveBeenCalledTimes(2);
      expect(result).toBe(newCode);
    });

    it("throws InternalServerErrorException after 10 collisions with no successful save", async () => {
      inviteCodeRepo.findOne.mockResolvedValue(null);

      const uniqueViolation = new Error("unique_violation") as any;
      uniqueViolation.code = "23505";

      const failingCode = makeInviteCode();
      mockManager.create.mockReturnValue(failingCode);
      mockManager.save.mockRejectedValue(uniqueViolation);

      await expect(service.generateCode(USER_A_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockManager.save).toHaveBeenCalledTimes(10);
    });

    it("throws InternalServerErrorException on unexpected save error (non-23505)", async () => {
      inviteCodeRepo.findOne.mockResolvedValue(null);
      const unexpectedError = new Error("disk full");
      mockManager.create.mockReturnValue(makeInviteCode());
      mockManager.save.mockRejectedValue(unexpectedError);

      await expect(service.generateCode(USER_A_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("generates an 8-character alphanumeric code (smoke test via transaction create call)", async () => {
      inviteCodeRepo.findOne.mockResolvedValue(null);
      const newCode = makeInviteCode();
      let capturedCode: string | undefined;
      mockManager.create.mockImplementation((_entity, data) => {
        capturedCode = data.code;
        return newCode;
      });
      mockManager.save.mockResolvedValue(newCode);

      await service.generateCode(USER_A_ID);

      expect(capturedCode).toMatch(/^[A-Z2-9]{8}$/);
    });
  });

  // =========================================================================
  // redeemCode
  // =========================================================================

  describe("redeemCode", () => {
    function setupQueryBuilder(inviteCode: InviteCode | null) {
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(inviteCode),
      };
      mockManager.createQueryBuilder = jest.fn().mockReturnValue(qb);
      return qb;
    }

    it("marks the invite code as used and creates a connection on success", async () => {
      const invite = makeInviteCode({ owner_user_id: USER_A_ID, used_by_user_id: null });
      const mockConnection = { id: "conn-1" };
      setupQueryBuilder(invite);
      mockManager.save.mockResolvedValue(invite);
      connectionsService.createFromInvite.mockResolvedValue(mockConnection);

      const result = await service.redeemCode(USER_B_ID, "ABCD1234");

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          used_by_user_id: USER_B_ID,
          used_at: expect.any(Date),
        }),
      );
      expect(connectionsService.createFromInvite).toHaveBeenCalledWith(
        USER_B_ID,
        USER_A_ID,
        mockManager,
      );
      expect(result).toMatchObject({ connection: mockConnection });
    });

    it("returns owner display name from first_name and last_name when both are set", async () => {
      const owner = makeUser({ id: USER_A_ID, first_name: "Alice", last_name: "Smith" });
      const invite = makeInviteCode({ owner_user_id: USER_A_ID, owner, used_by_user_id: null });
      setupQueryBuilder(invite);
      mockManager.save.mockResolvedValue(invite);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      const result = await service.redeemCode(USER_B_ID, "ABCD1234");

      expect(result.owner.display_name).toBe("Alice Smith");
    });

    it("returns owner display_name using first_name when last_name is missing", async () => {
      const owner = makeUser({ id: USER_A_ID, first_name: "Alice", last_name: null });
      const invite = makeInviteCode({ owner_user_id: USER_A_ID, owner, used_by_user_id: null });
      setupQueryBuilder(invite);
      mockManager.save.mockResolvedValue(invite);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      const result = await service.redeemCode(USER_B_ID, "ABCD1234");

      expect(result.owner.display_name).toBe("Alice");
    });

    it("returns display_name=null when owner has no name", async () => {
      const owner = makeUser({ id: USER_A_ID, first_name: null, last_name: null });
      const invite = makeInviteCode({ owner_user_id: USER_A_ID, owner, used_by_user_id: null });
      setupQueryBuilder(invite);
      mockManager.save.mockResolvedValue(invite);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      const result = await service.redeemCode(USER_B_ID, "ABCD1234");

      expect(result.owner.display_name).toBeNull();
    });

    it("uppercases the provided code before querying", async () => {
      const invite = makeInviteCode({ used_by_user_id: null });
      const qb = setupQueryBuilder(invite);
      mockManager.save.mockResolvedValue(invite);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      await service.redeemCode(USER_B_ID, "abcd1234");

      expect(qb.where).toHaveBeenCalledWith("ic.code = :code", { code: "ABCD1234" });
    });

    it("throws NotFoundException when the code is not found or is expired", async () => {
      setupQueryBuilder(null);

      await expect(service.redeemCode(USER_B_ID, "INVALID1")).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when the code has already been used", async () => {
      const usedInvite = makeInviteCode({ used_by_user_id: "some-other-user" });
      setupQueryBuilder(usedInvite);

      await expect(service.redeemCode(USER_B_ID, "ABCD1234")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the user tries to use their own invite code", async () => {
      const invite = makeInviteCode({ owner_user_id: USER_A_ID, used_by_user_id: null });
      setupQueryBuilder(invite);

      await expect(service.redeemCode(USER_A_ID, "ABCD1234")).rejects.toThrow(BadRequestException);
    });

    it("uses pessimistic_write lock on the query builder", async () => {
      const invite = makeInviteCode({ used_by_user_id: null });
      const qb = setupQueryBuilder(invite);
      mockManager.save.mockResolvedValue(invite);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      await service.redeemCode(USER_B_ID, "ABCD1234");

      expect(qb.setLock).toHaveBeenCalledWith("pessimistic_write");
    });

    it("throws InternalServerErrorException on unexpected database errors", async () => {
      mockManager.createQueryBuilder = jest.fn().mockImplementation(() => {
        throw new Error("DB unavailable");
      });

      await expect(service.redeemCode(USER_B_ID, "ABCD1234")).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // =========================================================================
  // connectByLink
  // =========================================================================

  describe("connectByLink", () => {
    it("creates a connection when target user exists and no connection yet", async () => {
      const targetUser = makeUser({ id: USER_B_ID, first_name: "Bob", last_name: "Jones" });
      const mockConnection = { id: "conn-1" };
      userRepo.findOne.mockResolvedValue(targetUser);
      connectionsService.findConnection.mockResolvedValue(null);
      connectionsService.createFromInvite.mockResolvedValue(mockConnection);

      const result = await service.connectByLink(USER_A_ID, USER_B_ID);

      expect(connectionsService.createFromInvite).toHaveBeenCalledWith(USER_A_ID, USER_B_ID);
      expect(result).toMatchObject({
        connection: mockConnection,
        owner: {
          id: USER_B_ID,
          first_name: "Bob",
          last_name: "Jones",
        },
      });
    });

    it("throws BadRequestException when userId equals targetUserId", async () => {
      await expect(service.connectByLink(USER_A_ID, USER_A_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws NotFoundException when target user does not exist", async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.connectByLink(USER_A_ID, USER_B_ID)).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when a connection already exists between the two users", async () => {
      const targetUser = makeUser({ id: USER_B_ID });
      userRepo.findOne.mockResolvedValue(targetUser);
      connectionsService.findConnection.mockResolvedValue({ id: "existing-conn" });

      await expect(service.connectByLink(USER_A_ID, USER_B_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("returns owner with id, first_name, and last_name from target user", async () => {
      const targetUser = makeUser({ id: USER_B_ID, first_name: "Bob", last_name: "Jones" });
      userRepo.findOne.mockResolvedValue(targetUser);
      connectionsService.findConnection.mockResolvedValue(null);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      const result = await service.connectByLink(USER_A_ID, USER_B_ID);

      expect(result.owner).toEqual({
        id: USER_B_ID,
        first_name: "Bob",
        last_name: "Jones",
      });
    });

    it("throws InternalServerErrorException on unexpected errors", async () => {
      userRepo.findOne.mockRejectedValue(new Error("DB crash"));

      await expect(service.connectByLink(USER_A_ID, USER_B_ID)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("calls findOne with the target user's id", async () => {
      const targetUser = makeUser({ id: USER_B_ID });
      userRepo.findOne.mockResolvedValue(targetUser);
      connectionsService.findConnection.mockResolvedValue(null);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      await service.connectByLink(USER_A_ID, USER_B_ID);

      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: USER_B_ID } });
    });

    it("calls findConnection with both user ids to check for existing connection", async () => {
      const targetUser = makeUser({ id: USER_B_ID });
      userRepo.findOne.mockResolvedValue(targetUser);
      connectionsService.findConnection.mockResolvedValue(null);
      connectionsService.createFromInvite.mockResolvedValue({ id: "conn-1" });

      await service.connectByLink(USER_A_ID, USER_B_ID);

      expect(connectionsService.findConnection).toHaveBeenCalledWith(USER_A_ID, USER_B_ID);
    });
  });
});
