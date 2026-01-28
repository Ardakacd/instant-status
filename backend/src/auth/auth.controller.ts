import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UserService } from "../user/user.service";
import { z } from "zod";
import { AuthGuard } from "./auth.guard";

const VerifyTokenDtoSchema = z.object({
  idToken: z.string(),
});

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService
  ) {}

  @Post("firebase-token-verify")
  async verifyToken(@Body() body: unknown) {
    const { idToken } = VerifyTokenDtoSchema.parse(body);

    const decodedToken = await this.authService.verifyFirebaseToken(idToken);

    if (!decodedToken.uid) {
      throw new UnauthorizedException("Firebase UID not found in token");
    }

    const user = await this.authService.getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || null,
      true // This is a new login
    );

    // Check if onboarding is needed (user doesn't exist or missing first_name/last_name)
    const needsOnboarding = !user.first_name || !user.last_name;

    return {
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      firebase_uid: decodedToken.uid,
      onboarding: needsOnboarding,
    };
  }

  @Post("refresh-token")
  @UseGuards(AuthGuard)
  async refreshToken(@Request() req) {
    // User comes from AuthGuard, so it's guaranteed to exist
    // But we still fetch fresh data from database
    const user = await this.userService.findById(req.user.id);

    // This shouldn't happen since user comes from token, but handle it gracefully
    if (!user) {
      throw new UnauthorizedException("User not found");
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
      throw new UnauthorizedException("User not found");
    }

    await this.authService.sendEmailVerification(user.firebase_uid);
    return { message: "Verification email sent successfully" };
  }

  @Post("forgot-password")
  async forgotPassword(@Body() body: unknown) {
    const { email } = z
      .object({
        email: z.string().email(),
      })
      .parse(body);

    // Always return success to prevent email enumeration
    await this.authService.sendPasswordResetEmail(email);
    return {
      message:
        "If an account exists with this email, a password reset link has been sent.",
    };
  }
}
