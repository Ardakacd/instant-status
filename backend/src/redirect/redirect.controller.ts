import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { redactUid } from "../utils/redact";

/**
 * Public redirect controller for universal links
 * Handles redirects from https:// URLs to deep links (instant-status://)
 * This makes links clickable in WhatsApp and other messaging apps
 */
@Controller()
export class RedirectController {
  private readonly logger = new StructuredLogger(RedirectController.name);
  /**
   * Redirect endpoint for connection links
   * Rate limited to prevent abuse / enumeration
   * Redirects from https://instantstatus.app/connect/{userId} to instant-status://connect/{userId}
   */
  @Get("connect/:userId")
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 req/min per IP
  async redirectToDeepLink(
    @Param("userId") userId: string,
    @Res() res: Response
  ) {
    // Validate userId is a valid UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      this.logger.warn("Connect redirect rejected: invalid user ID format");
      return res.status(HttpStatus.BAD_REQUEST).send("Invalid user ID format");
    }

    this.logger.debug(`Redirect connect -> deep link (target: ${redactUid(userId)})`);
    const deepLink = `instant-status://connect/${userId}`;
    return res.redirect(HttpStatus.MOVED_PERMANENTLY, deepLink);
  }

  /**
   * Redirect endpoint for email verification links
   * Redirects from https://instantstatus.app/verify?mode=verifyEmail&oobCode=... to instant-status://verify?mode=verifyEmail&oobCode=...
   * Rate limited to prevent abuse
   */
  @Get("verify")
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 req/min per IP
  async redirectVerifyEmail(@Res() res: Response, @Query() query: any) {
    const { mode, oobCode } = query;

    if (!mode || !oobCode) {
      this.logger.warn("Verify redirect rejected: missing mode or oobCode");
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send("Missing mode or oobCode parameter");
    }

    this.logger.debug(`Redirect verify -> deep link (mode: ${mode})`);
    const deepLink = `instant-status://verify?mode=${encodeURIComponent(mode)}&oobCode=${encodeURIComponent(oobCode)}`;
    return res.redirect(HttpStatus.MOVED_PERMANENTLY, deepLink);
  }
}
