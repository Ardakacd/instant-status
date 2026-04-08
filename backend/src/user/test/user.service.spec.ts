import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { InternalServerErrorException } from "@nestjs/common";

import { UserService } from "../user.service";
import { User } from "../../entities/user.entity";
import { Status } from "../../entities/status.entity";
import { Connection } from "../../entities/connection.entity";
import { EmailService } from "../../email/email.service";
import { StatusOptionService } from "../../status-option/status-option.service";
import { ConnectionsService } from "../../connections/connections.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Capture the real Date constructor before any test can mock it.
const RealDate = global.Date;

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

// A chainable QueryBuilder stub whose getCount() can be configured per-test.
function makeQueryBuilderStub(count: number) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
  };
  return qb;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockUserRepository = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  remove: jest.fn(),
});

const mockStatusRepository = () => ({
  findOne: jest.fn(),
});

const mockConnectionRepository = () => ({
  createQueryBuilder: jest.fn(),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
});

const mockEmailService = () => ({
  sendWelcomeEmail: jest.fn(),
});

const mockStatusOptionService = () => ({
  getDefaultStatusOption: jest.fn(),
});

const mockConnectionsService = () => ({
  notifyPeersUserAccountDeleted: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("UserService.getStats", () => {
  let service: UserService;
  let connectionRepo: ReturnType<typeof mockConnectionRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        { provide: getRepositoryToken(Status), useFactory: mockStatusRepository },
        { provide: getRepositoryToken(Connection), useFactory: mockConnectionRepository },
        { provide: DataSource, useFactory: mockDataSource },
        { provide: EmailService, useFactory: mockEmailService },
        { provide: StatusOptionService, useFactory: mockStatusOptionService },
        { provide: ConnectionsService, useFactory: mockConnectionsService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    connectionRepo = module.get(getRepositoryToken(Connection));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // friend_count
  // -------------------------------------------------------------------------

  describe("friend_count", () => {
    it("returns 0 when the user has no connections", async () => {
      const qb = makeQueryBuilderStub(0);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const user = makeUser({ created_at: new Date("2026-04-06T00:00:00.000Z") });
      const result = await service.getStats(user);

      expect(result.friend_count).toBe(0);
    });

    it("returns the correct count when the user has multiple connections", async () => {
      const qb = makeQueryBuilderStub(5);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const user = makeUser({ created_at: new Date("2026-04-06T00:00:00.000Z") });
      const result = await service.getStats(user);

      expect(result.friend_count).toBe(5);
    });

    it("queries with both user_id and friend_id conditions to cover normalised pairs", async () => {
      const qb = makeQueryBuilderStub(3);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const user = makeUser({ id: "abc-123" });
      await service.getStats(user);

      // The WHERE clause must use OR so both sides of the normalised pair are counted.
      expect(qb.where).toHaveBeenCalledWith(
        "c.user_id = :id OR c.friend_id = :id",
        { id: "abc-123" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // days_since_first_login
  // -------------------------------------------------------------------------

  describe("days_since_first_login", () => {
    // Helper: freeze Date() to return `frozenNow` while still letting
    // `new Date(arg)` (called with an argument) construct real dates.
    function freezeNow(frozenNow: Date) {
      jest.spyOn(global, "Date").mockImplementation((arg?: any): any => {
        if (arg !== undefined) return new RealDate(arg as any);
        return frozenNow;
      });
    }

    it("returns 0 when the user was created today (same day, no full day elapsed)", async () => {
      const qb = makeQueryBuilderStub(0);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const createdAt = new RealDate("2026-04-06T11:00:00.000Z");
      const frozenNow = new RealDate("2026-04-06T12:00:00.000Z"); // 1 h later
      freezeNow(frozenNow);

      const user = makeUser({ created_at: createdAt });
      const result = await service.getStats(user);

      expect(result.days_since_first_login).toBe(0);
    });

    it("returns 1 after exactly one full day has elapsed", async () => {
      const qb = makeQueryBuilderStub(0);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const createdAt = new RealDate("2026-04-06T00:00:00.000Z");
      const frozenNow = new RealDate("2026-04-07T00:00:00.000Z"); // exactly 24 h later
      freezeNow(frozenNow);

      const user = makeUser({ created_at: createdAt });
      const result = await service.getStats(user);

      expect(result.days_since_first_login).toBe(1);
    });

    it("returns 30 after 30 full days", async () => {
      const qb = makeQueryBuilderStub(0);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const createdAt = new RealDate("2026-03-07T00:00:00.000Z");
      const frozenNow = new RealDate("2026-04-06T00:00:00.000Z"); // exactly 30 days later
      freezeNow(frozenNow);

      const user = makeUser({ created_at: createdAt });
      const result = await service.getStats(user);

      expect(result.days_since_first_login).toBe(30);
    });

    it("floors a partial day (23 h 59 m elapsed still counts as 0)", async () => {
      const qb = makeQueryBuilderStub(0);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const createdAt = new RealDate("2026-04-05T00:01:00.000Z");
      const frozenNow = new RealDate("2026-04-06T00:00:00.000Z"); // 23 h 59 m later
      freezeNow(frozenNow);

      const user = makeUser({ created_at: createdAt });
      const result = await service.getStats(user);

      expect(result.days_since_first_login).toBe(0);
    });

    it("uses Math.floor so boundary values are not rounded up", async () => {
      const qb = makeQueryBuilderStub(0);
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      // 1.9999 days elapsed → should still be 1, not 2
      const msPerDay = 1000 * 60 * 60 * 24;
      const createdAt = new RealDate(0);
      const frozenNow = new RealDate(Math.floor(1.9999 * msPerDay));
      freezeNow(frozenNow);

      const user = makeUser({ created_at: createdAt });
      const result = await service.getStats(user);

      expect(result.days_since_first_login).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("throws InternalServerErrorException when the query fails", async () => {
      connectionRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error("DB connection lost");
      });

      const user = makeUser();
      await expect(service.getStats(user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it("throws InternalServerErrorException when getCount rejects", async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockRejectedValue(new Error("query timeout")),
      };
      connectionRepo.createQueryBuilder.mockReturnValue(qb);

      const user = makeUser();
      await expect(service.getStats(user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
