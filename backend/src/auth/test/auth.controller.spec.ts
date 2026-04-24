import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";

import { AuthController } from "../auth.controller";
import { AuthService } from "../auth.service";
import { UserService } from "../../user/user.service";
import { AuthGuard } from "../auth.guard";
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

function makeSyncResponse(overrides: Partial<Record<string, any>> = {}) {
  return {
    user: {
      id: "user-uuid-1",
      firebase_uid: "firebase-uid-1",
      email: "alice@example.com",
      first_name: "Alice",
      last_name: "Smith",
      is_premium: false,
      premium_until: null,
      is_in_grace_period: false,
      should_reset_custom_status: false,
    },
    onboarding: false,
    emailVerified: true,
    ...overrides,
  };
}

// Mock AuthGuard that always allows access and attaches a default user.
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

const mockAuthService = () => ({
  syncAuthState: jest.fn(),
  sendEmailVerification: jest.fn(),
  hardDeleteUser: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
});

const mockUserService = () => ({
  findById: jest.fn(),
  findByFirebaseUid: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("AuthController", () => {
  let controller: AuthController;
  let authService: ReturnType<typeof mockAuthService>;
  let userService: ReturnType<typeof mockUserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useFactory: mockAuthService },
        { provide: UserService, useFactory: mockUserService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // POST /auth/sync
  // =========================================================================

  describe("POST /auth/sync", () => {
    it("calls authService.syncAuthState with the extracted idToken", async () => {
      const response = makeSyncResponse();
      authService.syncAuthState.mockResolvedValue(response);

      const result = await controller.sync({ idToken: "firebase-token" });

      expect(authService.syncAuthState).toHaveBeenCalledWith("firebase-token");
      expect(result).toBe(response);
    });

    it("returns the full sync response including user, onboarding, and emailVerified", async () => {
      const response = makeSyncResponse({ onboarding: true, emailVerified: false });
      authService.syncAuthState.mockResolvedValue(response);

      const result = await controller.sync({ idToken: "token" });

      expect(result.onboarding).toBe(true);
      expect(result.emailVerified).toBe(false);
      expect(result.user).toBeDefined();
    });

    it("throws ZodError when idToken is missing from the request body", async () => {
      // Zod schema is strict — missing idToken must throw
      await expect(controller.sync({})).rejects.toThrow();
    });

    it("throws ZodError when the body contains unknown fields", async () => {
      // Schema is strict — extra fields must be rejected
      await expect(
        controller.sync({ idToken: "token", extra: "field" }),
      ).rejects.toThrow();
    });

    it("throws ZodError when idToken is not a string", async () => {
      await expect(controller.sync({ idToken: 12345 })).rejects.toThrow();
    });

    it("propagates errors thrown by authService.syncAuthState", async () => {
      authService.syncAuthState.mockRejectedValue(new Error("Firebase down"));

      await expect(controller.sync({ idToken: "token" })).rejects.toThrow(
        "Firebase down",
      );
    });

    it("is not protected by AuthGuard (no guard metadata on sync)", () => {
      const guards: any[] =
        Reflect.getMetadata("__guards__", controller.sync) ?? [];
      const guardTokens = guards.map((g) =>
        typeof g === "function" ? g : g?.constructor,
      );
      expect(guardTokens).not.toContain(AuthGuard);
    });
  });

  // =========================================================================
  // POST /auth/send-email-verification
  // =========================================================================

  describe("POST /auth/send-email-verification", () => {
    it("sends a verification email for the authenticated user", async () => {
      const user = makeUser();
      authService.sendEmailVerification.mockResolvedValue(undefined);

      const result = await controller.sendEmailVerification({ user });

      expect(authService.sendEmailVerification).toHaveBeenCalledWith(
        user.firebase_uid,
      );
      expect(result).toEqual({ message: "Verification email sent successfully" });
    });

    it("propagates errors thrown by authService.sendEmailVerification", async () => {
      const user = makeUser();
      authService.sendEmailVerification.mockRejectedValue(
        new Error("Firebase unavailable"),
      );

      await expect(
        controller.sendEmailVerification({ user }),
      ).rejects.toThrow("Firebase unavailable");
    });

    it("is protected by AuthGuard", () => {
      const guards: any[] =
        Reflect.getMetadata("__guards__", controller.sendEmailVerification) ?? [];
      const guardTokens = guards.map((g) =>
        typeof g === "function" ? g : g?.constructor,
      );
      expect(guardTokens).toContain(AuthGuard);
    });
  });

  // =========================================================================
  // DELETE /auth/account
  // =========================================================================

  describe("DELETE /auth/account", () => {
    it("calls authService.hardDeleteUser with the authenticated user", async () => {
      const user = makeUser();
      authService.hardDeleteUser.mockResolvedValue({ success: true });

      const result = await controller.deleteAccount({ user });

      expect(authService.hardDeleteUser).toHaveBeenCalledWith(user);
      expect(result).toEqual({ success: true });
    });

    it("propagates errors thrown by authService.hardDeleteUser", async () => {
      const user = makeUser();
      authService.hardDeleteUser.mockRejectedValue(new Error("Firebase error"));

      await expect(controller.deleteAccount({ user })).rejects.toThrow(
        "Firebase error",
      );
    });

    it("is protected by AuthGuard", () => {
      const guards: any[] =
        Reflect.getMetadata("__guards__", controller.deleteAccount) ?? [];
      const guardTokens = guards.map((g) =>
        typeof g === "function" ? g : g?.constructor,
      );
      expect(guardTokens).toContain(AuthGuard);
    });
  });

  // =========================================================================
  // POST /auth/forgot-password
  // =========================================================================

  describe("POST /auth/forgot-password", () => {
    it("calls authService.sendPasswordResetEmail with the provided email", async () => {
      authService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await controller.forgotPassword({
        email: "alice@example.com",
      });

      expect(authService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "alice@example.com",
      );
      expect(result).toEqual({
        message: expect.stringContaining("password reset link"),
      });
    });

    it("always returns the same success message regardless of whether the email exists (prevents enumeration)", async () => {
      authService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await controller.forgotPassword({
        email: "nonexistent@example.com",
      });

      expect(result.message).toBeTruthy();
    });

    it("throws ZodError when email is not a valid email address", async () => {
      await expect(
        controller.forgotPassword({ email: "not-an-email" }),
      ).rejects.toThrow();
    });

    it("throws ZodError when email field is missing", async () => {
      await expect(controller.forgotPassword({})).rejects.toThrow();
    });

    it("throws ZodError when the body contains unknown fields", async () => {
      await expect(
        controller.forgotPassword({ email: "alice@example.com", extra: "data" }),
      ).rejects.toThrow();
    });

    it("propagates errors thrown by authService.sendPasswordResetEmail", async () => {
      authService.sendPasswordResetEmail.mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(
        controller.forgotPassword({ email: "alice@example.com" }),
      ).rejects.toThrow("Unexpected error");
    });

    it("is not protected by AuthGuard (public endpoint)", () => {
      const guards: any[] =
        Reflect.getMetadata("__guards__", controller.forgotPassword) ?? [];
      const guardTokens = guards.map((g) =>
        typeof g === "function" ? g : g?.constructor,
      );
      expect(guardTokens).not.toContain(AuthGuard);
    });
  });
});
