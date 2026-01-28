import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import * as admin from "firebase-admin";
import { UserService } from "../user/user.service";
import { EmailService } from "../email/email.service";
import { getFirebaseAdmin } from "../config/firebase-admin.config";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private firebaseAdmin: admin.app.App;

  constructor(
    private userService: UserService,
    private emailService: EmailService
  ) {
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

  async getOrCreateUser(
    uid: string,
    email?: string | null,
    isNewLogin: boolean = false
  ) {
    try {
      let user = await this.userService.findByFirebaseUid(uid);
      const isFirstLogin = !user;
      
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

      // Track login times
      const now = new Date();
      const updateData: Partial<typeof user> = {};
      
      if (isFirstLogin) {
        updateData.first_login_at = now;
      }
      
      if (isNewLogin) {
        updateData.last_login_at = now;
        await this.userService.update(user.id, updateData);
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

  /**
   * Generate email verification link and send via Postmark
   */
  async sendEmailVerification(uid: string): Promise<void> {
    try {
      // Get Firebase user
      const firebaseUser = await this.firebaseAdmin.auth().getUser(uid);

      if (!firebaseUser.email) {
        throw new BadRequestException("User does not have an email address");
      }

      if (firebaseUser.emailVerified) {
        throw new BadRequestException("Email is already verified");
      }

      // Generate email verification link (expires in 24 hours)
      const actionCodeSettings = {
        url: "https://instantstatus.app/verify",
        handleCodeInApp: true,
      };

      const verificationLink =
        await this.firebaseAdmin
          .auth()
          .generateEmailVerificationLink(firebaseUser.email, actionCodeSettings);

      // Send email via Postmark
      await this.emailService.sendEmailVerification(
        firebaseUser.email,
        verificationLink
      );

      this.logger.log(`Email verification sent to ${firebaseUser.email}`);
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      this.logger.error(
        `Error sending email verification: ${error.message}`,
        error.stack
      );
      throw new InternalServerErrorException(
        "Failed to send verification email"
      );
    }
  }

  /**
   * Generate password reset link and send via Postmark
   * Link expires in 15 minutes for security
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      // Check if user exists with this email
      const user = await this.userService.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists or not (security best practice)
        // Still return success to prevent email enumeration
        this.logger.log(
          `Password reset requested for non-existent email: ${email}`
        );
        return;
      }

      // Get Firebase user by email
      let firebaseUser;
      try {
        firebaseUser = await this.firebaseAdmin
          .auth()
          .getUserByEmail(email);
      } catch (firebaseError: any) {
        if (firebaseError.code === "auth/user-not-found") {
          // User doesn't exist in Firebase - don't reveal this
          this.logger.log(
            `Password reset requested for email not in Firebase: ${email}`
          );
          return;
        }
        throw firebaseError;
      }

      // Check if user signed up with email/password (not social login)
      const hasPasswordProvider = firebaseUser.providerData.some(
        (provider) => provider.providerId === "password"
      );

      if (!hasPasswordProvider) {
        // User signed up with Google/Apple - they don't have a password
        // Don't reveal this, just return success
        this.logger.log(
          `Password reset requested for social login user: ${email}`
        );
        return;
      }

      // Generate password reset link (expires in 15 minutes)
      const actionCodeSettings = {
        url: "https://instantstatus.app/reset-password",
        handleCodeInApp: true,
      };

      const resetLink = await this.firebaseAdmin
        .auth()
        .generatePasswordResetLink(email, actionCodeSettings);

      // Send email via Postmark
      await this.emailService.sendPasswordResetEmail(email, resetLink);

      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error: any) {
      // Don't reveal specific errors to prevent email enumeration
      this.logger.error(
        `Error sending password reset email: ${error.message}`,
        error.stack
      );
      // Return success even on error to prevent email enumeration
      // The error is logged for debugging
    }
  }
}
