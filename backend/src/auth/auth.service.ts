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
        // User doesn't exist with this Firebase UID
        // Check if email already exists with a different Firebase UID
        if (email) {
          const existingUserByEmail = await this.userService.findByEmail(email);
          if (existingUserByEmail && existingUserByEmail.firebase_uid !== uid) {
            // Email exists but with different Firebase UID
            // Check if the old Firebase user still exists
            try {
              await this.firebaseAdmin
                .auth()
                .getUser(existingUserByEmail.firebase_uid);
              // Old Firebase user still exists - this is a conflict
              // Don't delete, let the unique constraint error happen
            } catch (firebaseError: any) {
              // Old Firebase user doesn't exist (deleted)
              // Safe to delete the orphaned backend record
              console.log("firebaseError", firebaseError.code);
              if (firebaseError.code === "auth/user-not-found") {
                this.logger.log(
                  `Deleting orphaned user record for email ${email} (Firebase UID ${existingUserByEmail.firebase_uid} no longer exists)`
                );
                await this.userService.delete(existingUserByEmail.id);
              }
            }
          }
        }

        // Create new user
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
      // Handle unique constraint violation (email already exists)
      if (error.code === "23505" && error.constraint?.includes("email")) {
        // Email constraint violation - try to find and clean up orphaned record
        if (email) {
          const existingUser = await this.userService.findByEmail(email);
          if (existingUser && existingUser.firebase_uid !== uid) {
            // Check if old Firebase user exists
            try {
              await this.firebaseAdmin
                .auth()
                .getUser(existingUser.firebase_uid);
              // Old Firebase user still exists - real conflict
              throw new InternalServerErrorException(
                "An account with this email already exists"
              );
            } catch (firebaseError: any) {
              // Old Firebase user doesn't exist - delete orphaned record and retry
              if (firebaseError.code === "auth/user-not-found") {
                this.logger.log(
                  `Deleting orphaned user record for email ${email} and retrying creation`
                );
                await this.userService.delete(existingUser.id);
                // Retry creation
                return await this.userService.create({
                  firebase_uid: uid,
                  email: email || null,
                  first_name: null,
                  last_name: null,
                });
              }
            }
          }
        }
        throw new InternalServerErrorException(
          "An account with this email already exists"
        );
      }

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
