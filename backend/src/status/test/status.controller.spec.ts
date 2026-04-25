import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

import { StatusController } from "../status.controller";
import { StatusService } from "../status.service";
import { StatusOptionService } from "../../status-option/status-option.service";
import { Status } from "../../entities/status.entity";
import { StatusOption } from "../../entities/status-option.entity";
import { User } from "../../entities/user.entity";

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
  opt.id = "cccccccc-0000-0000-0000-000000000001";
  opt.user_id = null;
  opt.label = "Available";
  opt.emoji = "🟢";
  opt.color = "#10B981";
  opt.sort_order = 0;
  return Object.assign(opt, overrides);
}

function makeStatus(overrides: Partial<Status> = {}): Status {
  const status = new Status();
  status.user_id = "aaaaaaaa-0000-0000-0000-000000000001";
  status.option_id = "cccccccc-0000-0000-0000-000000000001";
  status.option = makeStatusOption();
  status.note = null;
  status.expires_at = null;
  status.updated_at = new Date("2026-04-07T10:00:00.000Z");
  return Object.assign(status, overrides);
}

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockStatusService = () => ({
  updateStatus: jest.fn(),
  getUserStatus: jest.fn(),
  getFriendsStatus: jest.fn(),
});

const mockStatusOptionService = () => ({
  getDefaultStatusOption: jest.fn(),
});

// ---------------------------------------------------------------------------
// Helper: builds a mock NestJS request with an authenticated user
// ---------------------------------------------------------------------------

function mockRequest(user: User = makeUser()) {
  return { user };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("StatusController", () => {
  let controller: StatusController;
  let statusService: ReturnType<typeof mockStatusService>;
  let statusOptionService: ReturnType<typeof mockStatusOptionService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
      ],
      controllers: [StatusController],
      providers: [
        { provide: StatusService, useFactory: mockStatusService },
        { provide: StatusOptionService, useFactory: mockStatusOptionService },
        // Override ThrottlerGuard so rate-limiting doesn't interfere with unit tests
        {
          provide: APP_GUARD,
          useValue: { canActivate: () => true },
        },
      ],
    })
      // Skip the real AuthGuard — tests supply the user directly via req.user
      .overrideGuard(require("../../auth/auth.guard").AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StatusController>(StatusController);
    statusService = module.get(StatusService);
    statusOptionService = module.get(StatusOptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // PATCH /status  (updateStatus)
  // =========================================================================

  describe("updateStatus", () => {
    const userId = "aaaaaaaa-0000-0000-0000-000000000001";
    const optionId = "cccccccc-0000-0000-0000-000000000001";

    it("returns shaped status response on successful update", async () => {
      const option = makeStatusOption();
      const status = makeStatus();
      const req = mockRequest();

      statusService.updateStatus.mockResolvedValue({ status, option });

      const result = await controller.updateStatus(req, {
        option_id: optionId,
      });

      expect(statusService.updateStatus).toHaveBeenCalledWith(
        userId,
        optionId,
        "Alice Smith",
        undefined, // no note
        undefined, // no expires_at
      );
      expect(result).toEqual({
        user_id: userId,
        option: {
          id: option.id,
          label: option.label,
          emoji: option.emoji,
          color: option.color,
        },
        note: null,
        expires_at: null,
        updated_at: status.updated_at.toISOString(),
      });
    });

    it("passes note and expires_at to the service", async () => {
      const option = makeStatusOption();
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
      const status = makeStatus({ note: "In a meeting", expires_at: future });
      const req = mockRequest();

      statusService.updateStatus.mockResolvedValue({ status, option });

      const result = await controller.updateStatus(req, {
        option_id: optionId,
        note: "In a meeting",
        expires_at: future.toISOString(),
      });

      expect(statusService.updateStatus).toHaveBeenCalledWith(
        userId,
        optionId,
        "Alice Smith",
        "In a meeting",
        expect.any(Date),
      );
      expect(result.note).toBe("In a meeting");
      expect(result.expires_at).toBe(future.toISOString());
    });

    it("falls back to first_name only when last_name is absent", async () => {
      const option = makeStatusOption();
      const status = makeStatus();
      const req = mockRequest(makeUser({ last_name: null }));

      statusService.updateStatus.mockResolvedValue({ status, option });

      await controller.updateStatus(req, { option_id: optionId });

      expect(statusService.updateStatus).toHaveBeenCalledWith(
        userId,
        optionId,
        "Alice", // first_name only
        undefined,
        undefined,
      );
    });

    it("falls back to 'Someone' when both first_name and last_name are absent", async () => {
      const option = makeStatusOption();
      const status = makeStatus();
      const req = mockRequest(makeUser({ first_name: null, last_name: null }));

      statusService.updateStatus.mockResolvedValue({ status, option });

      await controller.updateStatus(req, { option_id: optionId });

      expect(statusService.updateStatus).toHaveBeenCalledWith(
        userId,
        optionId,
        "Someone",
        undefined,
        undefined,
      );
    });

    it("throws ZodError (parsed as BadRequestException) when option_id is missing", async () => {
      const req = mockRequest();

      await expect(
        controller.updateStatus(req, {}),
      ).rejects.toThrow(); // Zod parse throws before reaching service
      expect(statusService.updateStatus).not.toHaveBeenCalled();
    });

    it("throws ZodError when option_id is not a valid UUID", async () => {
      const req = mockRequest();

      await expect(
        controller.updateStatus(req, { option_id: "not-a-uuid" }),
      ).rejects.toThrow();
      expect(statusService.updateStatus).not.toHaveBeenCalled();
    });

    it("throws ZodError when note exceeds 200 characters", async () => {
      const req = mockRequest();
      const longNote = "a".repeat(201);

      await expect(
        controller.updateStatus(req, { option_id: optionId, note: longNote }),
      ).rejects.toThrow();
      expect(statusService.updateStatus).not.toHaveBeenCalled();
    });

    it("throws ZodError when expires_at is in the past", async () => {
      const req = mockRequest();
      const past = new Date(Date.now() - 60_000).toISOString();

      await expect(
        controller.updateStatus(req, { option_id: optionId, expires_at: past }),
      ).rejects.toThrow();
    });

    it("throws ZodError when expires_at is more than 30 days in the future", async () => {
      const req = mockRequest();
      const tooFar = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        controller.updateStatus(req, { option_id: optionId, expires_at: tooFar }),
      ).rejects.toThrow();
    });

    it("throws ZodError when unknown fields are present (strict schema)", async () => {
      const req = mockRequest();

      await expect(
        controller.updateStatus(req, { option_id: optionId, unknown_field: "oops" }),
      ).rejects.toThrow();
    });

    it("propagates BadRequestException from the service (e.g. premium check)", async () => {
      const req = mockRequest();
      statusService.updateStatus.mockRejectedValue(
        new BadRequestException("Custom statuses are only available with Instant Status Pro."),
      );

      await expect(
        controller.updateStatus(req, { option_id: optionId }),
      ).rejects.toThrow(BadRequestException);
    });

    it("returns null for expires_at in the response when status has no expiration", async () => {
      const option = makeStatusOption();
      const status = makeStatus({ expires_at: null });
      const req = mockRequest();

      statusService.updateStatus.mockResolvedValue({ status, option });

      const result = await controller.updateStatus(req, { option_id: optionId });

      expect(result.expires_at).toBeNull();
    });
  });

  // =========================================================================
  // GET /status/me  (getMyStatus)
  // =========================================================================

  describe("getMyStatus", () => {
    const userId = "aaaaaaaa-0000-0000-0000-000000000001";

    it("returns current status with option when status exists", async () => {
      const status = makeStatus();
      const req = mockRequest();

      statusService.getUserStatus.mockResolvedValue(status);

      const result = await controller.getMyStatus(req);

      expect(statusService.getUserStatus).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        user_id: userId,
        option: {
          id: status.option.id,
          label: status.option.label,
          emoji: status.option.emoji,
          color: status.option.color,
        },
        note: null,
        expires_at: null,
        updated_at: status.updated_at.toISOString(),
      });
    });

    it("returns default status option when user has no status", async () => {
      const defaultOption = makeStatusOption();
      const req = mockRequest();

      statusService.getUserStatus.mockResolvedValue(null);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(defaultOption);

      const result = await controller.getMyStatus(req);

      expect(statusOptionService.getDefaultStatusOption).toHaveBeenCalled();
      expect(result.user_id).toBe(userId);
      expect(result.option?.id).toBe(defaultOption.id);
      expect(result.note).toBeNull();
      expect(result.expires_at).toBeNull();
    });

    it("returns null option when no status and no default option exists", async () => {
      const req = mockRequest();

      statusService.getUserStatus.mockResolvedValue(null);
      statusOptionService.getDefaultStatusOption.mockResolvedValue(null);

      const result = await controller.getMyStatus(req);

      expect(result.option).toBeNull();
    });

    it("includes note and expires_at when status has them", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const status = makeStatus({ note: "Back at 3pm", expires_at: future });
      const req = mockRequest();

      statusService.getUserStatus.mockResolvedValue(status);

      const result = await controller.getMyStatus(req);

      expect(result.note).toBe("Back at 3pm");
      expect(result.expires_at).toBe(future.toISOString());
    });

    it("returns null option when status exists but option is null", async () => {
      const status = makeStatus({ option: null as any });
      const req = mockRequest();

      statusService.getUserStatus.mockResolvedValue(status);

      const result = await controller.getMyStatus(req);

      expect(result.option).toBeNull();
    });
  });

  // =========================================================================
  // GET /status/friends  (getFriendsStatus)
  // =========================================================================

  describe("getFriendsStatus", () => {
    const userId = "aaaaaaaa-0000-0000-0000-000000000001";

    it("delegates to statusService and returns the result directly", async () => {
      const friendsStatus = [
        {
          user_id: "bbbbbbbb-0000-0000-0000-000000000002",
          first_name: "Bob",
          last_name: "Jones",
          avatar_url: null,
          option: { id: "opt-1", label: "Busy", emoji: "🔴", color: "#EF4444" },
          note: null,
          expires_at: null,
          updated_at: new Date().toISOString(),
        },
      ];
      const req = mockRequest();

      statusService.getFriendsStatus.mockResolvedValue(friendsStatus);

      const result = await controller.getFriendsStatus(req);

      expect(statusService.getFriendsStatus).toHaveBeenCalledWith(userId);
      expect(result).toBe(friendsStatus);
    });

    it("returns an empty array when user has no friends", async () => {
      const req = mockRequest();

      statusService.getFriendsStatus.mockResolvedValue([]);

      const result = await controller.getFriendsStatus(req);

      expect(result).toEqual([]);
    });
  });

});
