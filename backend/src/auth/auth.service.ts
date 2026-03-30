import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { User } from "../entities/user.entity";
import * as admin from "firebase-admin";
import { UserService } from "../user/user.service";
import { EmailService } from "../email/email.service";
import { getFirebaseAdmin } from "../config/firebase-admin.config";
import { redactEmail, redactUid } from "../utils/redact";
import { computePremiumGraceFlags, isUserPremium } from "../utils/premium";

@Injectable()
export class AuthService {
  private readonly logger = new StructuredLogger(AuthService.name);
  private firebaseAdmin: admin.app.App;

  constructor(
    private userService: UserService,
    private emailService: EmailService,
  ) {
    this.firebaseAdmin = getFirebaseAdmin();
  }

  /**
   * Firebase-first account deletion.
   * If Firebase deletion fails, nothing is deleted — user can retry.
   * If Firebase succeeds but DB fails, the Firebase account is already gone so
   * the user cannot authenticate again; we log critically for manual cleanup
   * but still return success since the account is effectively inaccessible.
   */
  async hardDeleteUser(user: User): Promise<{ success: boolean }> {
    try {
      await this.firebaseAdmin.auth().deleteUser(user.firebase_uid);
      this.logger.log(`Firebase account deleted (UID: ${redactUid(user.firebase_uid)})`);
    } catch (error: any) {
      this.logger.error(`Firebase deletion failed — DB untouched, user can retry: ${error.message}`, {
        event: "account_deletion_firebase_failed",
        userId: redactUid(user.firebase_uid),
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException(
        "Failed to delete account. Please try again.",
      );
    }

    try {
      await this.userService.delete(user.id);
      this.logger.log(`DB records wiped for user (UID: ${redactUid(user.firebase_uid)})`);
    } catch (error: any) {
      // Firebase account is already gone — the user cannot authenticate.
      // Log critically for manual DB cleanup but do not surface to the user.
      this.logger.error(`DB deletion failed after Firebase deletion — manual cleanup required: ${error.message}`, {
        event: "account_deletion_db_failed",
        userId: redactUid(user.firebase_uid),
        error: error.message,
        stack: error.stack,
      });
    }

    return { success: true };
  }

  async verifyFirebaseToken(
    idToken: string,
  ): Promise<admin.auth.DecodedIdToken> {
    try {
      const decodedToken = await this.firebaseAdmin
        .auth()
        .verifyIdToken(idToken);
      return decodedToken;
    } catch (error: any) {
      this.logger.error(`Firebase token verification failed: ${error.message}`, {
        event: "token_verification",
        error: error.message,
      });
      throw new UnauthorizedException("You are not authorized");
    }
  }

  /**
   * Atomic sync: verify token, get/create user, return full auth state in one response.
   * Eliminates race conditions from separate verify + getMe + checkEmailVerification calls.
   */
  async syncAuthState(idToken: string): Promise<{
    user: { id: string; firebase_uid: string; email: string | null; first_name: string | null; last_name: string | null; is_premium: boolean; premium_until: Date | null; is_in_grace_period: boolean; should_reset_custom_status: boolean };
    onboarding: boolean;
    emailVerified: boolean;
  }> {
    const decodedToken = await this.verifyFirebaseToken(idToken);
    if (!decodedToken.uid) {
      throw new UnauthorizedException("Firebase UID not found in token");
    }

    const user = await this.getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || null,
      true,
    );

    const onboarding = !user.first_name || !user.last_name;
    // Fail-safe: if the claim is absent, treat as unverified rather than accidentally granting access
    const emailVerified = decodedToken.email_verified ?? false;

    // For new password users with unverified email, send verification (non-blocking)
    const signInProvider = (decodedToken as any).firebase?.sign_in_provider;
    if (
      signInProvider === "password" &&
      !emailVerified &&
      user.email
    ) {
      this.sendEmailVerification(user.firebase_uid).catch((err) =>
        this.logger.warn(`Failed to send verification email: ${err.message}`),
      );
    }

    const { is_in_grace_period, should_reset_custom_status } =
      computePremiumGraceFlags(user);

    return {
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_premium: isUserPremium(user),
        premium_until: user.premium_until ?? null,
        is_in_grace_period,
        should_reset_custom_status,
      },
      onboarding,
      emailVerified,
    };
  }

  async getOrCreateUser(
    uid: string,
    email?: string | null,
    isNewLogin: boolean = false,
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
                  `Deleting orphaned user record for ${redactEmail(email)} (Firebase UID ${redactUid(existingUserByEmail.firebase_uid)} no longer exists)`,
                );
                await this.userService.delete(existingUserByEmail.id);
              } else {
                this.logger.error(
                  `Error checking Firebase user for orphan cleanup: ${firebaseError.message}`,
                  firebaseError.stack
                );
                throw firebaseError;
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
      if (isNewLogin) {
        const now = new Date();
        const updateData: Partial<typeof user> = { last_login_at: now };
        if (isFirstLogin) updateData.first_login_at = now;
        await this.userService.update(user.id, updateData);
      }

      return user;
    } catch (error: any) {
      // Handle unique constraint violation (email already exists)
      if (error.code === "23505" && error.constraint?.includes("email")) {
        if (email) {
          const existingUser = await this.userService.findByEmail(email);
          if (existingUser) {
            if (existingUser.firebase_uid === uid) {
              // A concurrent request for the same user already created the record.
              // Simply return it — no conflict.
              return existingUser;
            }

            // Different Firebase UID — could be an orphaned record or a real conflict.
            // Check if the old Firebase user still exists.
            try {
              await this.firebaseAdmin
                .auth()
                .getUser(existingUser.firebase_uid);
              // Old Firebase user still exists - real conflict
              throw new InternalServerErrorException(
                "An account with this email already exists",
              );
            } catch (firebaseError: any) {
              // Old Firebase user doesn't exist - delete orphaned record and retry
              if (firebaseError.code === "auth/user-not-found") {
                this.logger.log(
                  `Deleting orphaned user record for ${redactEmail(email)} and retrying creation`,
                );
                await this.userService.delete(existingUser.id);
                // Retry creation
                return await this.userService.create({
                  firebase_uid: uid,
                  email: email || null,
                  first_name: null,
                  last_name: null,
                });
              } else {
                this.logger.error(
                  `Error checking Firebase user for email conflict: ${firebaseError.message}`,
                  firebaseError.stack
                );
                throw firebaseError;
              }
            }
          }
        }
        throw new InternalServerErrorException(
          "An account with this email already exists",
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
        error.stack,
      );
      throw new InternalServerErrorException(
        "An error occurred while processing user",
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

      const verificationLink = await this.firebaseAdmin
        .auth()
        .generateEmailVerificationLink(firebaseUser.email, actionCodeSettings);

      // Send email via Postmark
      await this.emailService.sendEmailVerification(
        firebaseUser.email,
        verificationLink,
      );
    } catch (error: any) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      this.logger.error(
        `Error sending email verification: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        "Failed to send verification email",
      );
    }
  }

  /**
   * Generate password reset link and send via Postmark.
   * Link expires in 15 minutes for security.
   *
   * A baseline delay is started at the very beginning and every code path
   * awaits it before returning. This prevents timing-based enumeration of
   * which emails exist and which auth providers they use.
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    // 800 ms covers the typical email-send latency so all paths finish in ~800 ms.
    const baseline = new Promise<void>((resolve) => setTimeout(resolve, 800));

    try {
      const user = await this.userService.findByEmail(email);
      if (!user) {
        this.logger.log(
          `Password reset requested for non-existent email: ${redactEmail(email)}`,
        );
        await baseline;
        return;
      }

      let firebaseUser;
      try {
        firebaseUser = await this.firebaseAdmin.auth().getUserByEmail(email);
      } catch (firebaseError: any) {
        if (firebaseError.code === "auth/user-not-found") {
          this.logger.warn(
            `Password reset requested for email not in Firebase: ${redactEmail(email)}`,
          );
          await baseline;
          return;
        }
        throw firebaseError;
      }

      const hasPasswordProvider = firebaseUser.providerData.some(
        (provider) => provider.providerId === "password",
      );

      if (!hasPasswordProvider) {
        this.logger.warn(
          `Password reset requested for social login user: ${redactEmail(email)}`,
        );
        await baseline;
        return;
      }

      const actionCodeSettings = {
        url: "https://instantstatus.app/reset-password",
        handleCodeInApp: true,
      };

      const resetLink = await this.firebaseAdmin
        .auth()
        .generatePasswordResetLink(email, actionCodeSettings);

      // Run the email send and the baseline delay concurrently — the response
      // is held until both complete, so legitimate requests also take ≥ 800 ms.
      await Promise.all([
        baseline,
        this.emailService.sendPasswordResetEmail(email, resetLink),
      ]);
    } catch (error: any) {
      this.logger.error(
        `Error sending password reset email: ${error.message}`,
        error.stack,
      );
      // Absorb the error and wait out the baseline to maintain constant timing
      await baseline;
    }
  }
}
