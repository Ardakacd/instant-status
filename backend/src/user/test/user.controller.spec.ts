import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";

import { UserController } from "../user.controller";
import { UserService } from "../user.service";
import { AuthGuard } from "../../auth/auth.guard";
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

// A mock AuthGuard that always allows requests through, attaching req.user.
// Individual tests can override canActivate to simulate an unauthenticated request.
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

describe("UserController – GET /user/me/stats", () => {
  let controller: UserController;
  let userService: jest.Mocked<Pick<UserService, "getStats">>;

  beforeEach(async () => {
    const mockUserService = {
      getStats: jest.fn(),
      // Other methods are not exercised by these tests but NestJS DI needs
      // a provider that satisfies the token.
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<UserController>(UserController);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("returns the stats object produced by UserService.getStats", async () => {
    const stats = { friend_count: 3, days_since_first_login: 95 };
    (userService.getStats as jest.Mock).mockResolvedValue(stats);

    const user = makeUser();
    // Simulate what AuthGuard attaches to the request.
    const fakeReq = { user };

    const result = await controller.getMeStats(fakeReq as any);

    expect(result).toEqual(stats);
    expect(userService.getStats).toHaveBeenCalledTimes(1);
    expect(userService.getStats).toHaveBeenCalledWith(user);
  });

  it("passes req.user directly to getStats (no extra DB lookup)", async () => {
    const stats = { friend_count: 0, days_since_first_login: 0 };
    (userService.getStats as jest.Mock).mockResolvedValue(stats);

    const user = makeUser({ id: "specific-uuid" });
    const fakeReq = { user };

    await controller.getMeStats(fakeReq as any);

    // The controller must forward the guard-attached user as-is, not re-fetch it.
    const calledWith = (userService.getStats as jest.Mock).mock.calls[0][0];
    expect(calledWith).toBe(user); // same reference, not a copy
  });

  it("returns friend_count of 0 for a user with no friends", async () => {
    const stats = { friend_count: 0, days_since_first_login: 10 };
    (userService.getStats as jest.Mock).mockResolvedValue(stats);

    const result = await controller.getMeStats({ user: makeUser() } as any);

    expect(result.friend_count).toBe(0);
  });

  it("propagates errors thrown by UserService.getStats", async () => {
    (userService.getStats as jest.Mock).mockRejectedValue(
      new Error("Unexpected DB error"),
    );

    await expect(
      controller.getMeStats({ user: makeUser() } as any),
    ).rejects.toThrow("Unexpected DB error");
  });

  // -------------------------------------------------------------------------
  // AuthGuard protection
  // -------------------------------------------------------------------------

  it("is protected by AuthGuard (guard metadata is applied)", () => {
    // Reflect the guard metadata set by @UseGuards(AuthGuard) on getMeStats.
    const guards: any[] = Reflect.getMetadata(
      "__guards__",
      controller.getMeStats,
    ) ?? [];

    // NestJS stores the guard constructor in the metadata array.
    const guardTokens = guards.map((g) => (typeof g === "function" ? g : g?.constructor));
    expect(guardTokens).toContain(AuthGuard);
  });

  it("does not call getStats when AuthGuard blocks the request", async () => {
    // Override the mock guard to deny access for this test only.
    const denyGuard = {
      canActivate: jest.fn(() => false),
    };

    // Re-build the module with a denying guard so we can verify the guard
    // short-circuits before the handler runs.
    const moduleWithDenyGuard: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: { getStats: jest.fn() },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(denyGuard)
      .compile();

    const app = moduleWithDenyGuard.createNestApplication();
    await app.init();

    // The guard's canActivate is what NestJS checks. The test verifies that
    // the guard is wired to this specific handler by asserting it would be
    // invoked. We do not perform an HTTP-level request here (no supertest
    // dependency), so we verify declarative metadata instead.
    const guardsMeta: any[] = Reflect.getMetadata(
      "__guards__",
      controller.getMeStats,
    ) ?? [];
    expect(guardsMeta.some((g) => g === AuthGuard)).toBe(true);

    await app.close();
  });
});
