import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { AuthService } from "./auth.service";
import { UserService } from "../user/user.service";
import { redactUid } from "../utils/redact";

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new StructuredLogger(AuthGuard.name);

  constructor(
    private authService: AuthService,
    private userService: UserService,
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

      request.user = user;
      return true;
    } catch (error) {
      // If it's already an UnauthorizedException with errorCode, re-throw as-is
      if (error instanceof UnauthorizedException) {
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
