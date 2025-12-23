import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import * as admin from "firebase-admin";
import { UserService } from "../user/user.service";
import { getFirebaseAdmin } from "../config/firebase-admin.config";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private firebaseAdmin: admin.app.App;

  constructor(private userService: UserService) {
    this.firebaseAdmin = getFirebaseAdmin();
  }

  async verifyFirebaseToken(
    idToken: string
  ): Promise<admin.auth.DecodedIdToken> {
    try {
      const decodedToken = await this.firebaseAdmin
        .auth()
        .verifyIdToken(idToken);
      return decodedToken;
    } catch (error: any) {
      this.logger.error(`Firebase token verification failed: ${error.message}`);
      throw new UnauthorizedException("You are not authorized");
    }
  }

  async getOrCreateUser(uid: string, email?: string | null) {
    try {
      let user = await this.userService.findByFirebaseUid(uid);

      if (!user) {
        user = await this.userService.create({
          firebase_uid: uid,
          email: email || null,
          first_name: null,
          last_name: null,
        });
      } else if (email && !user.email) {
        // Update email if it wasn't set before
        user.email = email;
        user = await this.userService.update(user.id, { email });
      }

      return user;
    } catch (error: any) {
      
      if (
        error instanceof InternalServerErrorException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      
      this.logger.error(
        `Error getting or creating user: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "An error occurred while processing user"
      );
    }
  }
}
