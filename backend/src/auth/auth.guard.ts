import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { StructuredLogger } from "../common/logger/structured-logger";
import { AuthService } from "./auth.service";
import { UserService } from "../user/user.service";
import { redactUid } from "../utils/redact";

/**
 * Decorator for endpoints that must work before the user has verified their
 * email — specifically POST /auth/send-email-verification.
 */
export const ALLOW_UNVERIFIED_EMAIL_KEY = "allow_unverified_email";
export const AllowUnverifiedEmail = () =>
  SetMetadata(ALLOW_UNVERIFIED_EMAIL_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new StructuredLogger(AuthGuard.name);

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        message: "Missing or invalid authorization header",
        errorCode: "AUTH_REQUIRED",
      });
    }

    const token = authHeader.substring(7);

    try {
      const decodedToken = await this.authService.verifyFirebaseToken(token);

      if (!decodedToken.uid) {
        throw new UnauthorizedException({
          message: "Firebase UID not found in token",
          errorCode: "TOKEN_INVALID",
        });
      }

      // Get user from database by firebase_uid
      const user = await this.userService.findByFirebaseUid(decodedToken.uid);

      if (!user) {
        this.logger.warn(
          `Valid Firebase token but user not found in DB (uid: ${redactUid(decodedToken.uid)})`
        );
        throw new UnauthorizedException({
          message: "User not found",
          errorCode: "UNAUTHORIZED",
        });
      }

      // Enforce email verification unless the endpoint explicitly opts out.
      // This is defence-in-depth: the mobile app already gates unverified users
      // out of protected screens, but a raw API call with an unverified token
      // should still be rejected server-side.
      const allowUnverified = this.reflector.getAllAndOverride<boolean>(
        ALLOW_UNVERIFIED_EMAIL_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowUnverified && !decodedToken.email_verified) {
        throw new ForbiddenException({
          message: "Please verify your email address to continue.",
          errorCode: "EMAIL_NOT_VERIFIED",
        });
      }

      request.user = user;
      return true;
    } catch (error) {
      // If it's already an Unauthorized/ForbiddenException, re-throw as-is
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      // Otherwise, log and wrap in generic unauthorized error
      this.logger.error(
        `Auth guard error: ${error instanceof Error ? error.message : String(error)}`,
        {
          event: "auth_guard",
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }
      );
      throw new UnauthorizedException({
        message: "You are not authorized",
        errorCode: "UNAUTHORIZED",
      });
    }
  }
}
