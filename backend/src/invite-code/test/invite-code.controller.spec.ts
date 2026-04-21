import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext } from "@nestjs/common";

import { InviteCodeController } from "../invite-code.controller";
import { InviteCodeService } from "../invite-code.service";
import { AuthGuard } from "../../auth/auth.guard";
import { User } from "../../entities/user.entity";
import { InviteCode } from "../../entities/invite-code.entity";

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
  invite.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
  invite.used_by_user_id = null;
  invite.used_at = null;
  return Object.assign(invite, overrides);
}

// Mock AuthGuard that always passes requests through, attaching a default user.
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

const mockInviteCodeService = () => ({
  generateCode: jest.fn(),
  redeemCode: jest.fn(),
  connectByLink: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("InviteCodeController", () => {
  let controller: InviteCodeController;
  let inviteCodeService: ReturnType<typeof mockInviteCodeService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InviteCodeController],
      providers: [
        { provide: InviteCodeService, useFactory: mockInviteCodeService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<InviteCodeController>(InviteCodeController);
    inviteCodeService = module.get(InviteCodeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // POST /invite-code – generateCode
  // =========================================================================

  describe("POST /invite-code – generateCode", () => {
    it("calls service.generateCode with user id and no expiration when body is empty", async () => {
      const invite = makeInviteCode();
      inviteCodeService.generateCode.mockResolvedValue(invite);

      await controller.generateCode({ user: makeUser() }, {});

      expect(inviteCodeService.generateCode).toHaveBeenCalledWith(USER_A_ID, undefined);
    });

    it("passes expires_in_hours to service.generateCode when provided", async () => {
      const invite = makeInviteCode();
      inviteCodeService.generateCode.mockResolvedValue(invite);

      await controller.generateCode({ user: makeUser() }, { expires_in_hours: 48 });

      expect(inviteCodeService.generateCode).toHaveBeenCalledWith(USER_A_ID, 48);
    });

    it("returns code, expires_at, and created_at from the generated invite code", async () => {
      const invite = makeInviteCode();
      inviteCodeService.generateCode.mockResolvedValue(invite);

      const result = await controller.generateCode({ user: makeUser() }, {});

      expect(result).toEqual({
        code: invite.code,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
      });
    });

    it("does not expose internal invite code fields (e.g. id, owner_user_id)", async () => {
      const invite = makeInviteCode();
      inviteCodeService.generateCode.mockResolvedValue(invite);

      const result = await controller.generateCode({ user: makeUser() }, {});

      expect(result).not.toHaveProperty("id");
      expect(result).not.toHaveProperty("owner_user_id");
      expect(result).not.toHaveProperty("used_by_user_id");
    });

    it("throws ZodError when body contains unknown fields (strict schema)", async () => {
      await expect(
        controller.generateCode({ user: makeUser() }, { unknown_field: "bad" } as any),
      ).rejects.toThrow();
    });

    it("throws ZodError when expires_in_hours is a string instead of a number", async () => {
      await expect(
        controller.generateCode({ user: makeUser() }, { expires_in_hours: "48" } as any),
      ).rejects.toThrow();
    });

    it("propagates errors thrown by service.generateCode", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      inviteCodeService.generateCode.mockRejectedValue(
        new BadRequestException("Expiration hours must be greater than 0"),
      );

      await expect(
        controller.generateCode({ user: makeUser() }, { expires_in_hours: -1 }),
      ).rejects.toThrow("Expiration hours must be greater than 0");
    });
  });

  // =========================================================================
  // POST /invite-code/redeem – redeemCode
  // =========================================================================

  describe("POST /invite-code/redeem – redeemCode", () => {
    it("calls service.redeemCode with the authenticated user id and the provided code", async () => {
      const serviceResult = { connection: { id: "conn-1" }, owner: { id: USER_A_ID, display_name: "Alice Smith" } };
      inviteCodeService.redeemCode.mockResolvedValue(serviceResult);

      await controller.redeemCode({ user: makeUser({ id: USER_B_ID }) }, { code: "ABCD1234" });

      expect(inviteCodeService.redeemCode).toHaveBeenCalledWith(USER_B_ID, "ABCD1234");
    });

    it("returns the service result directly", async () => {
      const serviceResult = { connection: { id: "conn-1" }, owner: { id: USER_A_ID, display_name: "Alice Smith" } };
      inviteCodeService.redeemCode.mockResolvedValue(serviceResult);

      const result = await controller.redeemCode(
        { user: makeUser() },
        { code: "ABCD1234" },
      );

      expect(result).toBe(serviceResult);
    });

    it("throws ZodError when code length is not exactly 8 characters", async () => {
      await expect(
        controller.redeemCode({ user: makeUser() }, { code: "SHORT" }),
      ).rejects.toThrow();
    });

    it("throws ZodError when code is longer than 8 characters", async () => {
      await expect(
        controller.redeemCode({ user: makeUser() }, { code: "TOOLONGCODE" }),
      ).rejects.toThrow();
    });

    it("throws ZodError when code is missing from body", async () => {
      await expect(
        controller.redeemCode({ user: makeUser() }, {} as any),
      ).rejects.toThrow();
    });

    it("throws ZodError when body contains unknown fields (strict schema)", async () => {
      await expect(
        controller.redeemCode(
          { user: makeUser() },
          { code: "ABCD1234", extra: "bad" } as any,
        ),
      ).rejects.toThrow();
    });

    it("propagates NotFoundException from service.redeemCode", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      inviteCodeService.redeemCode.mockRejectedValue(
        new NotFoundException("Invalid or expired invite code"),
      );

      await expect(
        controller.redeemCode({ user: makeUser() }, { code: "ABCD1234" }),
      ).rejects.toThrow("Invalid or expired invite code");
    });

    it("propagates BadRequestException when user tries to redeem their own code", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      inviteCodeService.redeemCode.mockRejectedValue(
        new BadRequestException("Cannot use your own invite code"),
      );

      await expect(
        controller.redeemCode({ user: makeUser() }, { code: "ABCD1234" }),
      ).rejects.toThrow("Cannot use your own invite code");
    });
  });

  // =========================================================================
  // POST /invite-code/connect-by-link – connectByLink
  // =========================================================================

  describe("POST /invite-code/connect-by-link – connectByLink", () => {
    it("calls service.connectByLink with the authenticated user id and the target user id", async () => {
      const serviceResult = {
        connection: { id: "conn-1" },
        owner: { id: USER_B_ID, first_name: "Bob", last_name: "Jones" },
      };
      inviteCodeService.connectByLink.mockResolvedValue(serviceResult);

      await controller.connectByLink(
        { user: makeUser({ id: USER_A_ID }) },
        { user_id: USER_B_ID },
      );

      expect(inviteCodeService.connectByLink).toHaveBeenCalledWith(USER_A_ID, USER_B_ID);
    });

    it("returns the service result directly", async () => {
      const serviceResult = {
        connection: { id: "conn-1" },
        owner: { id: USER_B_ID, first_name: "Bob", last_name: "Jones" },
      };
      inviteCodeService.connectByLink.mockResolvedValue(serviceResult);

      const result = await controller.connectByLink(
        { user: makeUser() },
        { user_id: USER_B_ID },
      );

      expect(result).toBe(serviceResult);
    });

    it("throws BadRequestException with a friendly message when user_id is not a valid UUID", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      await expect(
        controller.connectByLink({ user: makeUser() }, { user_id: "not-a-uuid" }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.connectByLink({ user: makeUser() }, { user_id: "not-a-uuid" }),
      ).rejects.toThrow(/invite link is not valid/i);
    });

    it("throws BadRequestException when user_id is missing from body", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      await expect(
        controller.connectByLink({ user: makeUser() }, {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when body contains unknown fields (strict schema)", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      await expect(
        controller.connectByLink(
          { user: makeUser() },
          { user_id: USER_B_ID, extra: "bad" } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("propagates BadRequestException when user tries to connect to themselves", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      inviteCodeService.connectByLink.mockRejectedValue(
        new BadRequestException("Cannot connect to yourself"),
      );

      await expect(
        controller.connectByLink({ user: makeUser() }, { user_id: USER_B_ID }),
      ).rejects.toThrow("Cannot connect to yourself");
    });

    it("propagates NotFoundException when target user does not exist", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      inviteCodeService.connectByLink.mockRejectedValue(
        new NotFoundException(
          "We could not find this person. The link may be incorrect or outdated. Ask your friend to send their invite again.",
        ),
      );

      await expect(
        controller.connectByLink({ user: makeUser() }, { user_id: USER_B_ID }),
      ).rejects.toThrow(/could not find this person/i);
    });

    it("propagates BadRequestException when connection already exists", async () => {
      const { BadRequestException } = await import("@nestjs/common");
      inviteCodeService.connectByLink.mockRejectedValue(
        new BadRequestException("You are already connected with this user"),
      );

      await expect(
        controller.connectByLink({ user: makeUser() }, { user_id: USER_B_ID }),
      ).rejects.toThrow("You are already connected with this user");
    });
  });
});
