import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  NotFoundException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { UserService } from "../user/user.service";
import { z } from "zod";
import { AuthGuard, AllowUnverifiedEmail } from "./auth.guard";

const VerifyTokenDtoSchema = z
  .object({
    idToken: z.string(),
  })
  .strict(); // Reject unknown fields

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {}

  @Post("sync")
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 req/min per IP – app startup safe
  async sync(@Body() body: unknown) {
    const { idToken } = VerifyTokenDtoSchema.parse(body);
    return this.authService.syncAuthState(idToken);
  }

  @Post("send-email-verification")
  @UseGuards(AuthGuard)
  @AllowUnverifiedEmail() // Must work before the user has verified their email
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 req/min – prevent abuse
  async sendEmailVerification(@Request() req) {
    const user = await this.userService.findById(req.user.id);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.authService.sendEmailVerification(user.firebase_uid);
    return { message: "Verification email sent successfully" };
  }

  @Delete("account")
  @UseGuards(AuthGuard)
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
