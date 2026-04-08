import { Test, TestingModule } from "@nestjs/testing";
import { HttpStatus } from "@nestjs/common";
import { RedirectController } from "../redirect.controller";
import { Response } from "express";

describe("RedirectController", () => {
  let controller: RedirectController;
  let mockRes: jest.Mocked<Pick<Response, "redirect" | "status" | "send">>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedirectController],
    }).compile();

    controller = module.get<RedirectController>(RedirectController);

    mockRes = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as any;
  });

  describe("GET /connect/:userId", () => {
    it("redirects to deep link with 302 for a valid UUID", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000";
      await controller.redirectToDeepLink(userId, mockRes as any);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        HttpStatus.FOUND,
        `instant-status://connect/${userId}`
      );
    });

    it("accepts uppercase UUID", async () => {
      const userId = "550E8400-E29B-41D4-A716-446655440000";
      await controller.redirectToDeepLink(userId, mockRes as any);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        HttpStatus.FOUND,
        `instant-status://connect/${userId}`
      );
    });

    it("returns 400 for a plain string that is not a UUID", async () => {
      await controller.redirectToDeepLink("not-a-uuid", mockRes as any);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.send).toHaveBeenCalledWith("Invalid user ID format");
    });

    it("returns 400 for a numeric string", async () => {
      await controller.redirectToDeepLink("12345", mockRes as any);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it("returns 400 for a UUID with invalid hex characters", async () => {
      await controller.redirectToDeepLink(
        "550e8400-XXXX-41d4-a716-446655440000",
        mockRes as any
      );
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it("returns 400 for an empty string", async () => {
      await controller.redirectToDeepLink("", mockRes as any);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });

  describe("GET /verify", () => {
    it("redirects to deep link with encoded mode and oobCode", async () => {
      const mode = "verifyEmail";
      const oobCode = "abc123xyz";
      await controller.redirectVerifyEmail(mockRes as any, { mode, oobCode });
      expect(mockRes.redirect).toHaveBeenCalledWith(
        HttpStatus.FOUND,
        `instant-status://verify?mode=${encodeURIComponent(mode)}&oobCode=${encodeURIComponent(oobCode)}`
      );
    });

    it("URL-encodes special characters in oobCode", async () => {
      const mode = "verifyEmail";
      const oobCode = "abc+def/xyz=";
      await controller.redirectVerifyEmail(mockRes as any, { mode, oobCode });
      const [, location] = (mockRes.redirect as jest.Mock).mock.calls[0];
      expect(location).toContain(`oobCode=${encodeURIComponent(oobCode)}`);
    });

    it("returns 400 when mode is missing", async () => {
      await controller.redirectVerifyEmail(mockRes as any, { oobCode: "abc123" });
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockRes.send).toHaveBeenCalledWith("Missing mode or oobCode parameter");
    });

    it("returns 400 when oobCode is missing", async () => {
      await controller.redirectVerifyEmail(mockRes as any, { mode: "verifyEmail" });
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it("returns 400 when both mode and oobCode are missing", async () => {
      await controller.redirectVerifyEmail(mockRes as any, {});
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });
});
