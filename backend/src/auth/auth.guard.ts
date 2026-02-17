import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UserService } from "../user/user.service";

@Injectable()
export class AuthGuard implements CanActivate {
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
      // Otherwise, wrap in generic unauthorized error
      throw new UnauthorizedException({
        message: "You are not authorized",
        errorCode: "UNAUTHORIZED",
      });
    }
  }
}
