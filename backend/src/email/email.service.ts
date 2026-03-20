import { Injectable } from "@nestjs/common";
import { StructuredLogger } from "../common/logger/structured-logger";
import { ConfigService } from "@nestjs/config";
import { redactEmail } from "../utils/redact";
import * as postmark from "postmark";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

@Injectable()
export class EmailService {
  private readonly logger = new StructuredLogger(EmailService.name);
  private client: postmark.ServerClient | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("POSTMARK_API_KEY");
    if (apiKey) {
      this.client = new postmark.ServerClient(apiKey);
    } else {
      this.logger.warn(
        "POSTMARK_API_KEY not found. Email service will not be available."
      );
    }
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(
    email: string,
    verificationLink: string
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Email service is not configured");
    }

    try {
      await this.client.sendEmail({
        From: "InstantStatus <no-reply@instantstatus.app>",
        To: email,
        Subject: "Verify your InstantStatus email address",
        HtmlBody: this.getEmailVerificationTemplate(verificationLink),
        TextBody: this.getEmailVerificationTextTemplate(verificationLink),
        MessageStream: "outbound",
      });

      this.logger.log(`Email verification sent to ${redactEmail(email)}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send email verification to ${redactEmail(email)}: ${error.message}`,
        error.stack
      );
      throw new Error("Failed to send verification email");
    }
  }

  /**
   * HTML template for email verification
   */
  private getEmailVerificationTemplate(verificationLink: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f7;">
          <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1d1d1f; font-size: 28px; font-weight: 700; margin: 0;">Welcome to Instant Status!</h1>
            </div>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              Hello,
            </p>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 30px;">
              Thank you for signing up! To complete your registration and start using Instant Status, please verify your email address by clicking the button below:
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${verificationLink}" 
                 style="background-color: #007AFF; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            
            <p style="font-size: 14px; color: #86868b; margin-top: 30px; margin-bottom: 10px;">
              This verification link will expire in 24 hours for your security.
            </p>
            
            <p style="font-size: 14px; color: #86868b; margin-bottom: 30px;">
              If the button above doesn't work, copy and paste this link into your browser:<br>
              <a href="${verificationLink}" style="color: #007AFF; word-break: break-all;">${verificationLink}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 13px; color: #86868b; margin: 0;">
              <strong>Didn't create an account?</strong> If you didn't sign up for Instant Status, you can safely ignore this email. Your account will not be created.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; padding: 20px;">
            <p style="font-size: 12px; color: #86868b; margin: 0;">
              © ${new Date().getFullYear()} Instant Status. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Plain text template for email verification
   */
  private getEmailVerificationTextTemplate(verificationLink: string): string {
    return `
Welcome to Instant Status!

Thank you for signing up! To complete your registration and start using Instant Status, please verify your email address by visiting this link:

${verificationLink}

This verification link will expire in 24 hours for your security.

Didn't create an account? If you didn't sign up for Instant Status, you can safely ignore this email. Your account will not be created.

© ${new Date().getFullYear()} Instant Status. All rights reserved.
    `.trim();
  }

  /**
   * Send welcome email (first sign-in only)
   */
  async sendWelcomeEmail(email: string, firstName?: string | null): Promise<void> {
    if (!this.client) {
      throw new Error("Email service is not configured");
    }

    try {
      await this.client.sendEmail({
        From: "InstantStatus <no-reply@instantstatus.app>",
        To: email,
        Subject: "Welcome to Instant Status! 🎉",
        HtmlBody: this.getWelcomeEmailTemplate(firstName),
        TextBody: this.getWelcomeEmailTextTemplate(firstName),
        MessageStream: "outbound",
      });

      this.logger.log(`Welcome email sent to ${redactEmail(email)}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send welcome email to ${redactEmail(email)}: ${error.message}`,
        error.stack
      );
      throw new Error("Failed to send welcome email");
    }
  }

  /**
   * Send new device/location sign-in alert
   */
  async sendNewDeviceAlert(
    email: string,
    deviceInfo: { platform: string; location?: string },
    firstName?: string | null
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Email service is not configured");
    }

    try {
      await this.client.sendEmail({
        From: "InstantStatus <no-reply@instantstatus.app>",
        To: email,
        Subject: "New sign-in detected on Instant Status",
        HtmlBody: this.getNewDeviceAlertTemplate(deviceInfo, firstName),
        TextBody: this.getNewDeviceAlertTextTemplate(deviceInfo, firstName),
        MessageStream: "outbound",
      });

      this.logger.log(`New device alert sent to ${redactEmail(email)}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send new device alert to ${redactEmail(email)}: ${error.message}`,
        error.stack
      );
      throw new Error("Failed to send new device alert");
    }
  }

  /**
   * HTML template for welcome email
   */
  private getWelcomeEmailTemplate(firstName?: string | null): string {
    const greeting = firstName ? `Hello ${escapeHtml(firstName)},` : "Hello,";
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f7;">
          <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1d1d1f; font-size: 28px; font-weight: 700; margin: 0;">Welcome to Instant Status! 🎉</h1>
            </div>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              ${greeting}
            </p>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              We're excited to have you on board! You've successfully created your Instant Status account and can now start sharing your status with friends.
            </p>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 30px;">
              Here's what you can do next:
            </p>
            
            <ul style="font-size: 16px; color: #1d1d1f; margin-bottom: 30px; padding-left: 20px;">
              <li style="margin-bottom: 10px;">Set your current status (Available, Busy, etc.)</li>
              <li style="margin-bottom: 10px;">Connect with friends using invite codes</li>
              <li style="margin-bottom: 10px;">See your friends' real-time status updates</li>
            </ul>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 30px;">
              If you have any questions or need help, feel free to reach out to us anytime.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 13px; color: #86868b; margin: 0;">
              <strong>Didn't create an account?</strong> If you didn't sign up for Instant Status, please contact us immediately to secure your account.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; padding: 20px;">
            <p style="font-size: 12px; color: #86868b; margin: 0;">
              © ${new Date().getFullYear()} Instant Status. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Plain text template for welcome email
   */
  private getWelcomeEmailTextTemplate(firstName?: string | null): string {
    // Plain text part: do not use escapeHtml — entities like &#039; would show literally.
    const greeting = firstName ? `Hello ${firstName},` : "Hello,";
    
    return `
${greeting}

We're excited to have you on board! You've successfully created your Instant Status account and can now start sharing your status with friends.

Here's what you can do next:
- Set your current status (Available, Busy, or create custom statuses)
- Connect with friends using invite codes
- See your friends' real-time status updates

If you have any questions or need help, feel free to reach out to us anytime.

Didn't create an account? If you didn't sign up for Instant Status, please contact us immediately to secure your account.

© ${new Date().getFullYear()} Instant Status. All rights reserved.
    `.trim();
  }

  /**
   * HTML template for new device alert
   */
  private getNewDeviceAlertTemplate(
    deviceInfo: { platform: string; location?: string },
    firstName?: string | null
  ): string {
    const greeting = firstName ? `Hello ${escapeHtml(firstName)},` : "Hello,";
    const locationText = deviceInfo.location
      ? ` in ${deviceInfo.location}`
      : "";
    const deviceText =
      deviceInfo.platform === "iOS"
        ? "an iOS device"
        : deviceInfo.platform === "Android"
        ? "an Android device"
        : `a ${deviceInfo.platform} device`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f7;">
          <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1d1d1f; font-size: 28px; font-weight: 700; margin: 0;">🔒 New Sign-In Detected</h1>
            </div>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              ${greeting}
            </p>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              We detected a new sign-in to your Instant Status account from ${deviceText}${locationText}.
            </p>
            
            <div style="background-color: #f5f5f7; border-left: 4px solid #007AFF; padding: 16px; margin: 30px 0; border-radius: 4px;">
              <p style="font-size: 14px; color: #1d1d1f; margin: 0; font-weight: 600; margin-bottom: 8px;">Sign-In Details:</p>
              <p style="font-size: 14px; color: #86868b; margin: 0;">Device: ${deviceInfo.platform}</p>
              ${deviceInfo.location ? `<p style="font-size: 14px; color: #86868b; margin: 8px 0 0 0;">Location: ${deviceInfo.location}</p>` : ""}
              <p style="font-size: 14px; color: #86868b; margin: 8px 0 0 0;">Time: ${new Date().toLocaleString()}</p>
            </div>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              <strong>Was this you?</strong> If yes, you can safely ignore this email. If you don't recognize this sign-in, please secure your account immediately.
            </p>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 16px; margin: 30px 0;">
              <p style="font-size: 14px; color: #856404; margin: 0;">
                <strong>⚠️ Security Tip:</strong> If this wasn't you, change your password immediately and review your account security settings.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 13px; color: #86868b; margin: 0;">
              This is an automated security notification. If you have any concerns about your account security, please contact us immediately.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; padding: 20px;">
            <p style="font-size: 12px; color: #86868b; margin: 0;">
              © ${new Date().getFullYear()} Instant Status. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Plain text template for new device alert
   */
  private getNewDeviceAlertTextTemplate(
    deviceInfo: { platform: string; location?: string },
    firstName?: string | null
  ): string {
    // Plain text part: do not use escapeHtml — entities like &#039; would show literally.
    const greeting = firstName ? `Hello ${firstName},` : "Hello,";
    const locationText = deviceInfo.location
      ? ` in ${deviceInfo.location}`
      : "";
    const deviceText =
      deviceInfo.platform === "iOS"
        ? "an iOS device"
        : deviceInfo.platform === "Android"
        ? "an Android device"
        : `a ${deviceInfo.platform} device`;

    return `
${greeting}

We detected a new sign-in to your Instant Status account from ${deviceText}${locationText}.

Sign-In Details:
Device: ${deviceInfo.platform}
${deviceInfo.location ? `Location: ${deviceInfo.location}\n` : ""}Time: ${new Date().toLocaleString()}

Was this you? If yes, you can safely ignore this email. If you don't recognize this sign-in, please secure your account immediately.

⚠️ Security Tip: If this wasn't you, change your password immediately and review your account security settings.

This is an automated security notification. If you have any concerns about your account security, please contact us immediately.

© ${new Date().getFullYear()} Instant Status. All rights reserved.
    `.trim();
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetLink: string
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Email service is not configured");
    }

    try {
      await this.client.sendEmail({
        From: "InstantStatus <no-reply@instantstatus.app>",
        To: email,
        Subject: "Reset your InstantStatus password",
        HtmlBody: this.getPasswordResetTemplate(resetLink),
        TextBody: this.getPasswordResetTextTemplate(resetLink),
        MessageStream: "outbound",
      });

      this.logger.log(`Password reset email sent to ${redactEmail(email)}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send password reset email to ${redactEmail(email)}: ${error.message}`,
        error.stack
      );
      throw new Error("Failed to send password reset email");
    }
  }

  /**
   * HTML template for password reset
   */
  private getPasswordResetTemplate(resetLink: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f7;">
          <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1d1d1f; font-size: 28px; font-weight: 700; margin: 0;">Reset Your Password</h1>
            </div>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              Hello,
            </p>
            
            <p style="font-size: 16px; color: #1d1d1f; margin-bottom: 20px;">
              We received a request to reset the password for your Instant Status account. Click the button below to choose a new password:
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${resetLink}" 
                 style="background-color: #007AFF; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <p style="font-size: 14px; color: #86868b; margin-top: 30px; margin-bottom: 10px;">
              <strong>⚠️ Security Notice:</strong> This link will expire in 15 minutes for your security.
            </p>
            
            <p style="font-size: 14px; color: #86868b; margin-bottom: 30px;">
              If the button above doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetLink}" style="color: #007AFF; word-break: break-all;">${resetLink}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 13px; color: #86868b; margin: 0;">
              <strong>Didn't request this?</strong> If you didn't ask to reset your password, you can safely ignore this email. Your account is still secure and no changes have been made.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; padding: 20px;">
            <p style="font-size: 12px; color: #86868b; margin: 0;">
              © ${new Date().getFullYear()} Instant Status. All rights reserved.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Plain text template for password reset
   */
  private getPasswordResetTextTemplate(resetLink: string): string {
    return `
Reset Your Password

Hello,

We received a request to reset the password for your Instant Status account. Click the link below to choose a new password:

${resetLink}

⚠️ Security Notice: This link will expire in 15 minutes for your security.

Didn't request this? If you didn't ask to reset your password, you can safely ignore this email. Your account is still secure and no changes have been made.

© ${new Date().getFullYear()} Instant Status. All rights reserved.
    `.trim();
  }
}

