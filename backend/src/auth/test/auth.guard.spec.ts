import { ExecutionContext, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";

import { AuthGuard, ALLOW_UNVERIFIED_EMAIL_KEY, AllowUnverifiedEmail } from "../auth.guard";
import { AuthService } from "../auth.service";
import { UserService } from "../../user/user.service";
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

/**
 * Builds a minimal ExecutionContext that returns a request with the given
 * headers. The context's handler/class reflector metadata can be overridden
 * via the reflector mock directly.
 */
function makeContext(
  headers: Record<string, string> = {},
  requestOverrides: Record<string, any> = {},
): ExecutionContext {
  const request = { headers, user: undefined, ...requestOverrides };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockAuthService = () => ({
  verifyFirebaseToken: jest.fn(),
});

const mockUserService = () => ({
  findByFirebaseUid: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("AuthGuard", () => {
  let guard: AuthGuard;
  let authService: ReturnType<typeof mockAuthService>;
  let userService: ReturnType<typeof mockUserService>;
  let reflector: jest.Mocked<Reflector>;

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useFactory: mockAuthService },
        { provide: UserService, useFactory: mockUserService },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn().mockReturnValue(false),
          },
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    authService = module.get(AuthService);
    userService = module.get(UserService);
    reflector = module.get(Reflector) as jest.Mocked<Reflector>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  // =========================================================================
  // Missing / malformed authorization header
  // =========================================================================

  describe("missing or invalid Authorization header", () => {
    it("throws UnauthorizedException with AUTH_REQUIRED when header is absent", async () => {
      const ctx = makeContext({});

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "AUTH_REQUIRED" }),
      });
    });

    it("throws UnauthorizedException with AUTH_REQUIRED when header does not start with 'Bearer '", async () => {
      const ctx = makeContext({ authorization: "Basic some-token" });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "AUTH_REQUIRED" }),
      });
    });
  });

  // =========================================================================
  // No dev-token bypass: strings like "dev-test-*" are verified by Firebase like any token
  // =========================================================================

  describe("dev-test- prefix tokens (always via Firebase)", () => {
    it("in development, still calls verifyFirebaseToken with the full Bearer secret", async () => {
      process.env.NODE_ENV = "development";

      const decoded = { uid: "firebase-uid-1", email_verified: true };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      const user = makeUser();
      userService.findByFirebaseUid.mockResolvedValue(user);

      const ctx = makeContext({ authorization: "Bearer dev-test-firebase-uid-1" });

      await guard.canActivate(ctx);

      expect(authService.verifyFirebaseToken).toHaveBeenCalledWith("dev-test-firebase-uid-1");
      expect(userService.findByFirebaseUid).toHaveBeenCalledWith("firebase-uid-1");
    });

    it("in production, same — verifyFirebaseToken receives the literal token string", async () => {
      process.env.NODE_ENV = "production";

      const decoded = { uid: "firebase-uid-1", email_verified: true };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      const user = makeUser();
      userService.findByFirebaseUid.mockResolvedValue(user);

      const ctx = makeContext({ authorization: "Bearer dev-test-firebase-uid-1" });

      await guard.canActivate(ctx);

      expect(authService.verifyFirebaseToken).toHaveBeenCalledWith("dev-test-firebase-uid-1");
    });
  });

  // =========================================================================
  // Happy path — valid Firebase token
  // =========================================================================

  describe("valid Firebase token", () => {
    it("returns true and attaches the DB user to the request", async () => {
      const user = makeUser();
      const decoded = { uid: "firebase-uid-1", email_verified: true };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      userService.findByFirebaseUid.mockResolvedValue(user);

      const request: any = { headers: { authorization: "Bearer valid-firebase-token" } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(request.user).toBe(user);
    });

    it("passes the raw token (after stripping 'Bearer ') to verifyFirebaseToken", async () => {
      const user = makeUser();
      const decoded = { uid: "firebase-uid-1", email_verified: true };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      userService.findByFirebaseUid.mockResolvedValue(user);

      const ctx = makeContext({ authorization: "Bearer my.firebase.jwt" });
      await guard.canActivate(ctx);

      expect(authService.verifyFirebaseToken).toHaveBeenCalledWith("my.firebase.jwt");
    });
  });

  // =========================================================================
  // User not found in DB after valid token
  // =========================================================================

  describe("user not found in database", () => {
    it("throws UnauthorizedException with UNAUTHORIZED when valid token but no DB user", async () => {
      const decoded = { uid: "ghost-uid", email_verified: true };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      userService.findByFirebaseUid.mockResolvedValue(null);

      const ctx = makeContext({ authorization: "Bearer valid-token-for-ghost" });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "UNAUTHORIZED" }),
      });
    });
  });

  // =========================================================================
  // Email verification enforcement
  // =========================================================================

  describe("email verification enforcement", () => {
    it("throws ForbiddenException with EMAIL_NOT_VERIFIED for unverified email on protected endpoint", async () => {
      const user = makeUser();
      const decoded = { uid: "firebase-uid-1", email_verified: false };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      userService.findByFirebaseUid.mockResolvedValue(user);
      // Reflector returns false — endpoint does NOT allow unverified emails
      reflector.getAllAndOverride.mockReturnValue(false);

      const ctx = makeContext({ authorization: "Bearer some-token" });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "EMAIL_NOT_VERIFIED" }),
      });
    });

    it("allows unverified email when endpoint is decorated with @AllowUnverifiedEmail()", async () => {
      const user = makeUser();
      const decoded = { uid: "firebase-uid-1", email_verified: false };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      userService.findByFirebaseUid.mockResolvedValue(user);
      // Reflector returns true — endpoint allows unverified emails
      reflector.getAllAndOverride.mockReturnValue(true);

      const request: any = { headers: { authorization: "Bearer some-token" } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it("checks both handler and class metadata when resolving @AllowUnverifiedEmail", async () => {
      const user = makeUser();
      const decoded = { uid: "firebase-uid-1", email_verified: false };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      userService.findByFirebaseUid.mockResolvedValue(user);
      reflector.getAllAndOverride.mockReturnValue(true);

      const handlerSpy = jest.fn().mockReturnValue({});
      const classSpy = jest.fn().mockReturnValue({});

      const request: any = { headers: { authorization: "Bearer some-token" } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: handlerSpy,
        getClass: classSpy,
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);

      // Reflector must receive both handler and class targets
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        ALLOW_UNVERIFIED_EMAIL_KEY,
        [expect.anything(), expect.anything()],
      );
    });
  });

  // =========================================================================
  // Token missing uid
  // =========================================================================

  describe("decoded token missing uid", () => {
    it("throws UnauthorizedException with TOKEN_INVALID when decoded token has no uid", async () => {
      const decoded = { uid: undefined, email_verified: true };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);

      const ctx = makeContext({ authorization: "Bearer weird-token" });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "TOKEN_INVALID" }),
      });
    });
  });

  // =========================================================================
  // Unexpected errors from verifyFirebaseToken
  // =========================================================================

  describe("unexpected errors from AuthService", () => {
    it("wraps unexpected errors in UnauthorizedException with UNAUTHORIZED", async () => {
      authService.verifyFirebaseToken.mockRejectedValue(new Error("network failure"));

      const ctx = makeContext({ authorization: "Bearer some-token" });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "UNAUTHORIZED" }),
      });
    });

    it("re-throws UnauthorizedException as-is without wrapping", async () => {
      const original = new UnauthorizedException({
        message: "Original error",
        errorCode: "UNAUTHORIZED",
      });
      authService.verifyFirebaseToken.mockRejectedValue(original);

      const ctx = makeContext({ authorization: "Bearer some-token" });

      await expect(guard.canActivate(ctx)).rejects.toThrow(original);
    });

    it("re-throws ForbiddenException as-is without wrapping", async () => {
      const user = makeUser();
      const decoded = { uid: "firebase-uid-1", email_verified: false };
      authService.verifyFirebaseToken.mockResolvedValue(decoded as any);
      userService.findByFirebaseUid.mockResolvedValue(user);
      reflector.getAllAndOverride.mockReturnValue(false);

      const ctx = makeContext({ authorization: "Bearer some-token" });

      const error = await guard.canActivate(ctx).catch((e) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
    });
  });

  // =========================================================================
  // AllowUnverifiedEmail decorator
  // =========================================================================

  describe("AllowUnverifiedEmail decorator", () => {
    it("sets the correct metadata key on the target", () => {
      class TestController {
        @AllowUnverifiedEmail()
        handler() {}
      }

      const metadata = Reflect.getMetadata(
        ALLOW_UNVERIFIED_EMAIL_KEY,
        TestController.prototype.handler,
      );
      expect(metadata).toBe(true);
    });
  });
});
