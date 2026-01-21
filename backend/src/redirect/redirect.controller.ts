import { Controller, Get, Param, Query, Res, HttpStatus } from "@nestjs/common";
import { Response } from "express";

/**
 * Public redirect controller for universal links
 * Handles redirects from https:// URLs to deep links (instant-status://)
 * This makes links clickable in WhatsApp and other messaging apps
 */
@Controller()
export class RedirectController {
  /**
   * Redirect endpoint for connection links
   * Redirects from https://instantstatus.app/connect/{userId} to instant-status://connect/{userId}
   */
  @Get("connect/:userId")
  async redirectToDeepLink(
    @Param("userId") userId: string,
    @Res() res: Response
  ) {
    // Validate userId is a valid UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(HttpStatus.BAD_REQUEST).send("Invalid user ID format");
    }

    // Redirect to deep link
    const deepLink = `instant-status://connect/${userId}`;
    return res.redirect(HttpStatus.MOVED_PERMANENTLY, deepLink);
  }

  /**
   * Redirect endpoint for email verification links
   * Redirects from https://instantstatus.app/verify?mode=verifyEmail&oobCode=... to instant-status://verify?mode=verifyEmail&oobCode=...
   */
  @Get("verify")
  async redirectVerifyEmail(@Res() res: Response, @Query() query: any) {
    const { mode, oobCode } = query;

    if (!mode || !oobCode) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send("Missing mode or oobCode parameter");
    }

    // Redirect to deep link with query parameters
    const deepLink = `instant-status://verify?mode=${mode}&oobCode=${oobCode}`;
    return res.redirect(HttpStatus.MOVED_PERMANENTLY, deepLink);
  }
}
