import { Test, TestingModule } from "@nestjs/testing";
import {
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";

import { AuthService } from "../auth.service";
import { UserService } from "../../user/user.service";
import { EmailService } from "../../email/email.service";
import { User } from "../../entities/user.entity";

// ---------------------------------------------------------------------------
// Mock firebase-admin config module — must happen before any import resolves it
// ---------------------------------------------------------------------------

const mockVerifyIdToken = jest.fn();
const mockGetUser = jest.fn();
const mockGetUserByEmail = jest.fn();
const mockDeleteUser = jest.fn();
const mockGenerateEmailVerificationLink = jest.fn();
const mockGeneratePasswordResetLink = jest.fn();

const mockFirebaseAdmin = {
  auth: () => ({
    verifyIdToken: mockVerifyIdToken,
    getUser: mockGetUser,
    getUserByEmail: mockGetUserByEmail,
    deleteUser: mockDeleteUser,
    generateEmailVerificationLink: mockGenerateEmailVerificationLink,
    generatePasswordResetLink: mockGeneratePasswordResetLink,
  }),
};

jest.mock("../../config/firebase-admin.config", () => ({
  getFirebaseAdmin: jest.fn(() => mockFirebaseAdmin),
}));

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

function makeDecodedToken(overrides: Partial<Record<string, any>> = {}) {
  return {
    uid: "firebase-uid-1",
    email: "alice@example.com",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockUserService = () => ({
  findByFirebaseUid: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

const mockEmailService = () => ({
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("AuthService", () => {
  let service: AuthService;
  let userService: ReturnType<typeof mockUserService>;
  let emailService: ReturnType<typeof mockEmailService>;

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useFactory: mockUserService },
        { provide: EmailService, useFactory: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get(UserService);
    emailService = module.get(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  // =========================================================================
  // verifyFirebaseToken
  // =========================================================================

  describe("verifyFirebaseToken", () => {
    it("returns the decoded token when Firebase verifyIdToken succeeds", async () => {
      const decoded = makeDecodedToken();
      mockVerifyIdToken.mockResolvedValue(decoded);

      const result = await service.verifyFirebaseToken("valid-token");

      expect(result).toBe(decoded);
      expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-token");
    });

    it("throws UnauthorizedException when Firebase rejects the token", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("invalid token"));

      await expect(service.verifyFirebaseToken("bad-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // =========================================================================
  // syncAuthState
  // =========================================================================

  describe("syncAuthState", () => {
    describe("production flow (real Firebase token)", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "production";
      });

      it("returns user + onboarding=false + emailVerified=true for a complete verified user", async () => {
        const user = makeUser();
        const decoded = makeDecodedToken({ email_verified: true });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("firebase-id-token");

        expect(result.onboarding).toBe(false);
        expect(result.emailVerified).toBe(true);
        expect(result.user.id).toBe(user.id);
        expect(result.user.is_premium).toBe(false);
        expect(result.user.is_in_grace_period).toBe(false);
        expect(result.user.should_reset_custom_status).toBe(false);
      });

      it("returns onboarding=true when user has no first_name", async () => {
        const user = makeUser({ first_name: null });
        const decoded = makeDecodedToken({ email_verified: true });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("token");

        expect(result.onboarding).toBe(true);
      });

      it("returns onboarding=true when user has no last_name", async () => {
        const user = makeUser({ last_name: null });
        const decoded = makeDecodedToken({ email_verified: true });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("token");

        expect(result.onboarding).toBe(true);
      });

      it("returns emailVerified=false for unverified email", async () => {
        const user = makeUser();
        const decoded = makeDecodedToken({ email_verified: false });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("token");

        expect(result.emailVerified).toBe(false);
      });

      it("treats absent email_verified claim as false (fail-safe)", async () => {
        const user = makeUser();
        const decoded = makeDecodedToken({ email_verified: undefined });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("token");

        expect(result.emailVerified).toBe(false);
      });

      it("fires sendEmailVerification (non-blocking) for password users with unverified email", async () => {
        const user = makeUser();
        const decoded = makeDecodedToken({
          email_verified: false,
          firebase: { sign_in_provider: "password" },
        });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        // sendEmailVerification will attempt to call Firebase — mock it out
        mockGetUser.mockResolvedValue({
          email: "alice@example.com",
          emailVerified: false,
        });
        mockGenerateEmailVerificationLink.mockResolvedValue("https://verify.link");
        emailService.sendEmailVerification.mockResolvedValue(undefined);

        const result = await service.syncAuthState("token");

        // The call is non-blocking (fire-and-forget), so we just assert the
        // method returned successfully without waiting.
        expect(result.emailVerified).toBe(false);
      });

      it("creates a new user when they do not exist in the database", async () => {
        const newUser = makeUser({ first_name: null, last_name: null });
        const decoded = makeDecodedToken();
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(null);
        userService.findByEmail.mockResolvedValue(null);
        userService.create.mockResolvedValue(newUser);
        userService.update.mockResolvedValue(newUser);

        const result = await service.syncAuthState("token");

        expect(userService.create).toHaveBeenCalledWith({
          firebase_uid: decoded.uid,
          email: decoded.email,
          first_name: null,
          last_name: null,
        });
        expect(result.onboarding).toBe(true);
      });

      it("throws UnauthorizedException when Firebase token verification fails", async () => {
        mockVerifyIdToken.mockRejectedValue(new Error("token expired"));

        await expect(service.syncAuthState("bad-token")).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it("returns is_premium=true when premium_until is in the future", async () => {
        const future = new Date(Date.now() + 1_000_000_000);
        const user = makeUser({ premium_until: future });
        const decoded = makeDecodedToken({ email_verified: true });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("token");

        expect(result.user.is_premium).toBe(true);
      });

      it("includes correct is_in_grace_period flag for recently expired premium", async () => {
        // Expired 1 hour ago — still within the 3-day grace window
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const user = makeUser({ premium_until: oneHourAgo });
        const decoded = makeDecodedToken({ email_verified: true });
        mockVerifyIdToken.mockResolvedValue(decoded);
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("token");

        expect(result.user.is_premium).toBe(false);
        expect(result.user.is_in_grace_period).toBe(true);
      });
    });

    describe("dev bypass (NODE_ENV=development, dev-test- prefix)", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "development";
      });

      it("skips Firebase verification and loads user from DB by firebase_uid", async () => {
        const user = makeUser();
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("dev-test-firebase-uid-1");

        expect(mockVerifyIdToken).not.toHaveBeenCalled();
        expect(userService.findByFirebaseUid).toHaveBeenCalledWith("firebase-uid-1");
        expect(result.user.id).toBe(user.id);
      });

      it("returns emailVerified=true unconditionally for dev tokens", async () => {
        const user = makeUser();
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        const result = await service.syncAuthState("dev-test-firebase-uid-1");

        expect(result.emailVerified).toBe(true);
      });

      it("strips the 'dev-test-' prefix correctly before looking up firebase_uid", async () => {
        const user = makeUser({ firebase_uid: "test-user1" });
        userService.findByFirebaseUid.mockResolvedValue(user);
        userService.update.mockResolvedValue(user);

        await service.syncAuthState("dev-test-test-user1");

        expect(userService.findByFirebaseUid).toHaveBeenCalledWith("test-user1");
      });

      it("creates user when dev user does not exist in DB", async () => {
        const newUser = makeUser({ first_name: null, last_name: null });
        userService.findByFirebaseUid.mockResolvedValue(null);
        userService.findByEmail.mockResolvedValue(null);
        userService.create.mockResolvedValue(newUser);
        userService.update.mockResolvedValue(newUser);

        const result = await service.syncAuthState("dev-test-new-uid");

        expect(userService.create).toHaveBeenCalledWith({
          firebase_uid: "new-uid",
          email: null,
          first_name: null,
          last_name: null,
        });
        expect(result.emailVerified).toBe(true);
      });
    });
  });

  // =========================================================================
  // hardDeleteUser
  // =========================================================================

  describe("hardDeleteUser", () => {
    it("deletes the Firebase account and DB record, returns { success: true }", async () => {
      const user = makeUser();
      mockDeleteUser.mockResolvedValue(undefined);
      userService.delete.mockResolvedValue(undefined);

      const result = await service.hardDeleteUser(user);

      expect(mockDeleteUser).toHaveBeenCalledWith(user.firebase_uid);
      expect(userService.delete).toHaveBeenCalledWith(user.id);
      expect(result).toEqual({ success: true });
    });

    it("throws InternalServerErrorException and leaves DB untouched when Firebase deletion fails", async () => {
      const user = makeUser();
      mockDeleteUser.mockRejectedValue(new Error("Firebase error"));

      await expect(service.hardDeleteUser(user)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(userService.delete).not.toHaveBeenCalled();
    });

    it("still returns { success: true } when Firebase succeeds but DB deletion fails", async () => {
      const user = makeUser();
      mockDeleteUser.mockResolvedValue(undefined);
      userService.delete.mockRejectedValue(new Error("DB error"));

      // The account is effectively inaccessible after Firebase deletion,
      // so the method logs critically and absorbs the DB error.
      const result = await service.hardDeleteUser(user);

      expect(result).toEqual({ success: true });
    });
  });

  // =========================================================================
  // getOrCreateUser
  // =========================================================================

  describe("getOrCreateUser", () => {
    it("returns existing user when found by firebase_uid", async () => {
      const user = makeUser();
      userService.findByFirebaseUid.mockResolvedValue(user);
      userService.update.mockResolvedValue(user);

      const result = await service.getOrCreateUser("firebase-uid-1", "alice@example.com");

      expect(result).toBe(user);
      expect(userService.create).not.toHaveBeenCalled();
    });

    it("creates a new user when no existing user found", async () => {
      const newUser = makeUser();
      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(null);
      userService.create.mockResolvedValue(newUser);
      userService.update.mockResolvedValue(newUser);

      const result = await service.getOrCreateUser("new-uid", "new@example.com");

      expect(userService.create).toHaveBeenCalledWith({
        firebase_uid: "new-uid",
        email: "new@example.com",
        first_name: null,
        last_name: null,
      });
      expect(result).toBe(newUser);
    });

    it("updates the user email when existing user has no email set", async () => {
      const user = makeUser({ email: null });
      const updatedUser = makeUser({ email: "new@example.com" });
      userService.findByFirebaseUid.mockResolvedValue(user);
      userService.update.mockResolvedValue(updatedUser);

      await service.getOrCreateUser("firebase-uid-1", "new@example.com");

      expect(userService.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ email: "new@example.com" }),
      );
    });

    it("updates last_login_at when isNewLogin=true", async () => {
      const user = makeUser();
      userService.findByFirebaseUid.mockResolvedValue(user);
      userService.update.mockResolvedValue(user);

      await service.getOrCreateUser("firebase-uid-1", null, true);

      expect(userService.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ last_login_at: expect.any(Date) }),
      );
    });

    it("sets first_login_at on the very first login", async () => {
      const newUser = makeUser();
      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(null);
      userService.create.mockResolvedValue(newUser);
      userService.update.mockResolvedValue(newUser);

      await service.getOrCreateUser("new-uid", null, true);

      expect(userService.update).toHaveBeenCalledWith(
        newUser.id,
        expect.objectContaining({
          first_login_at: expect.any(Date),
          last_login_at: expect.any(Date),
        }),
      );
    });

    it("does not update login times when isNewLogin=false", async () => {
      const user = makeUser();
      userService.findByFirebaseUid.mockResolvedValue(user);
      // No update call should happen when isNewLogin is false
      userService.update.mockResolvedValue(user);

      await service.getOrCreateUser("firebase-uid-1", null, false);

      expect(userService.update).not.toHaveBeenCalled();
    });

    it("deletes orphaned user record and creates new one when old Firebase account is gone", async () => {
      const orphanedUser = makeUser({ firebase_uid: "old-firebase-uid" });
      const newUser = makeUser({ firebase_uid: "new-uid" });
      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(orphanedUser);
      userService.delete.mockResolvedValue(undefined);
      userService.create.mockResolvedValue(newUser);
      userService.update.mockResolvedValue(newUser);
      // Simulate old Firebase user not found
      mockGetUser.mockRejectedValue({ code: "auth/user-not-found" });

      const result = await service.getOrCreateUser("new-uid", "alice@example.com");

      expect(userService.delete).toHaveBeenCalledWith(orphanedUser.id);
      expect(userService.create).toHaveBeenCalled();
      expect(result).toBe(newUser);
    });

    it("throws InternalServerErrorException on unexpected DB errors", async () => {
      userService.findByFirebaseUid.mockRejectedValue(new Error("DB down"));

      await expect(
        service.getOrCreateUser("uid", "email@example.com"),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // =========================================================================
  // sendEmailVerification
  // =========================================================================

  describe("sendEmailVerification", () => {
    it("generates a link and sends the verification email", async () => {
      mockGetUser.mockResolvedValue({
        email: "alice@example.com",
        emailVerified: false,
      });
      mockGenerateEmailVerificationLink.mockResolvedValue("https://verify.link/abc");
      emailService.sendEmailVerification.mockResolvedValue(undefined);

      await service.sendEmailVerification("firebase-uid-1");

      expect(mockGenerateEmailVerificationLink).toHaveBeenCalledWith(
        "alice@example.com",
        expect.objectContaining({ url: expect.stringContaining("verify") }),
      );
      expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
        "alice@example.com",
        "https://verify.link/abc",
      );
    });

    it("throws BadRequestException when the Firebase user has no email", async () => {
      mockGetUser.mockResolvedValue({ email: null, emailVerified: false });

      await expect(service.sendEmailVerification("uid")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when the email is already verified", async () => {
      mockGetUser.mockResolvedValue({
        email: "alice@example.com",
        emailVerified: true,
      });

      await expect(service.sendEmailVerification("uid")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws InternalServerErrorException on unexpected Firebase errors", async () => {
      mockGetUser.mockRejectedValue(new Error("Firebase unavailable"));

      await expect(service.sendEmailVerification("uid")).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // =========================================================================
  // sendPasswordResetEmail
  // =========================================================================

  describe("sendPasswordResetEmail", () => {
    // Override the 800ms baseline delay so tests run at full speed
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("sends a password reset email for a valid password-provider user", async () => {
      const user = makeUser();
      userService.findByEmail.mockResolvedValue(user);
      mockGetUserByEmail.mockResolvedValue({
        providerData: [{ providerId: "password" }],
      });
      mockGeneratePasswordResetLink.mockResolvedValue("https://reset.link/xyz");
      emailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const promise = service.sendPasswordResetEmail("alice@example.com");
      jest.runAllTimers();
      await promise;

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "alice@example.com",
        "https://reset.link/xyz",
      );
    });

    it("returns silently (no email sent) when user is not in the database", async () => {
      userService.findByEmail.mockResolvedValue(null);

      const promise = service.sendPasswordResetEmail("unknown@example.com");
      jest.runAllTimers();
      await promise;

      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("returns silently when user is not in Firebase", async () => {
      const user = makeUser();
      userService.findByEmail.mockResolvedValue(user);
      mockGetUserByEmail.mockRejectedValue({ code: "auth/user-not-found" });

      const promise = service.sendPasswordResetEmail("alice@example.com");
      jest.runAllTimers();
      await promise;

      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("returns silently for social login users (no password provider)", async () => {
      const user = makeUser();
      userService.findByEmail.mockResolvedValue(user);
      mockGetUserByEmail.mockResolvedValue({
        providerData: [{ providerId: "google.com" }],
      });

      const promise = service.sendPasswordResetEmail("alice@example.com");
      jest.runAllTimers();
      await promise;

      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("absorbs unexpected errors without throwing (prevents email enumeration via error timing)", async () => {
      userService.findByEmail.mockRejectedValue(new Error("DB error"));

      const promise = service.sendPasswordResetEmail("alice@example.com");
      jest.runAllTimers();

      // Must not throw
      await expect(promise).resolves.toBeUndefined();
    });
  });
});
