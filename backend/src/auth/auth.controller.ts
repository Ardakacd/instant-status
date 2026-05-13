import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { z } from "zod";
import { AuthGuard, AllowUnverifiedEmail } from "./auth.guard";

const VerifyTokenDtoSchema = z
  .object({
    idToken: z.string().max(4096),
  })
  .strict(); // Reject unknown fields

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("sync")
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 req/min per IP — bootstrap endpoint, sized for shared NAT/CGNAT
  async sync(@Body() body: unknown) {
    const { idToken } = VerifyTokenDtoSchema.parse(body);
    return this.authService.syncAuthState(idToken);
  }

  @Post("send-email-verification")
  @UseGuards(AuthGuard)
  @AllowUnverifiedEmail() // Must work before the user has verified their email
  // 10/min per IP — high enough not to block multiple users behind the same NAT
  // (family WiFi, mobile carrier CGNAT). The real abuse defense is the per-UID
  // 60s dedup window in AuthService.sendEmailVerification, which silently
  // absorbs duplicate sends and protects Firebase's quota.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async sendEmailVerification(@Request() req) {
    await this.authService.sendEmailVerification(req.user.firebase_uid);
    return { message: "Verification email sent successfully" };
  }

  @Delete("account")
  @UseGuards(AuthGuard)
  @AllowUnverifiedEmail() // Unverified users must be able to delete their own account
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3/min – destructive operation
  async deleteAccount(@Request() req: any) {
    return this.authService.hardDeleteUser(req.user);
  }

  @Post("forgot-password")
  @Throttle({
    default: { limit: 3, ttl: 60000 },
    extended: { limit: 10, ttl: 3600000 },
  }) // 3/min + 10/hr per IP
  async forgotPassword(@Body() body: unknown) {
    const { email } = z
      .object({
        email: z.string().email(),
      })
      .strict() // Reject unknown fields
      .parse(body);

    // Always return success to prevent email enumeration
    await this.authService.sendPasswordResetEmail(email);
    return {
      message:
        "If an account exists with this email, a password reset link has been sent.",
    };
  }
}
