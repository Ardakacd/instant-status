import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,

  NotFoundException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UserService } from "../user/user.service";
import { z } from "zod";
import { AuthGuard } from "./auth.guard";

const VerifyTokenDtoSchema = z
  .object({
    idToken: z.string(),
  })
  .strict(); // Reject unknown fields

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService
  ) {}

  @Post("sync")
  async sync(@Body() body: unknown) {
    const { idToken } = VerifyTokenDtoSchema.parse(body);
    return this.authService.syncAuthState(idToken);
  }



  @Post("refresh-token")
  @UseGuards(AuthGuard)
  async refreshToken(@Request() req) {
    // User comes from AuthGuard, so it's guaranteed to exist
    // But we still fetch fresh data from database
    const user = await this.userService.findById(req.user.id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      onboarding: !user.first_name || !user.last_name,
    };
  }

  @Post("send-email-verification")
  @UseGuards(AuthGuard)
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
  async deleteAccount(@Request() req: any) {
    return this.authService.hardDeleteUser(req.user);
  }

  @Post("forgot-password")
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
