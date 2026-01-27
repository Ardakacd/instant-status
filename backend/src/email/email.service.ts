import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as postmark from "postmark";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
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

      this.logger.log(`Email verification sent to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send email verification to ${email}: ${error.message}`,
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
}

