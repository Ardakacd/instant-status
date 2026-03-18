import * as admin from "firebase-admin";
import { Repository, In } from "typeorm";
import { DeviceToken } from "../entities/device-token.entity";
import { StructuredLogger } from "../common/logger/structured-logger";

const INVALID_TOKEN_CODES = [
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
  "messaging/third-party-auth-error",
];

/**
 * Send FCM messages and clean up invalid tokens from the database.
 * Both status updates and friend-added notifications share this pattern.
 */
export async function sendEachAndCleanup(
  firebaseAdmin: admin.app.App,
  messages: any[],
  tokenToIdMap: Map<string, string>,
  deviceTokenRepository: Repository<DeviceToken>,
  logger: StructuredLogger,
): Promise<void> {
  const response = await firebaseAdmin.messaging().sendEach(messages);

  logger.debug(
    `Sent ${response.successCount}/${messages.length} push notifications`,
  );

  if (response.failureCount === 0) return;

  const invalidTokenIds: string[] = [];

  response.responses.forEach((result, index) => {
    if (!result.success && result.error) {
      const errorCode = result.error.code;
      const deviceTokenId = tokenToIdMap.get(messages[index].token);

      logger.warn(
        `Failed to send notification: ${errorCode} - ${result.error.message} (deviceTokenId: ${deviceTokenId ?? "unknown"})`,
      );

      if (INVALID_TOKEN_CODES.includes(errorCode) && deviceTokenId) {
        invalidTokenIds.push(deviceTokenId);
      }
    }
  });

  if (invalidTokenIds.length > 0) {
    try {
      await deviceTokenRepository.delete({ id: In(invalidTokenIds) });
      logger.log(`Deleted ${invalidTokenIds.length} invalid device token(s)`);
    } catch (deleteError: any) {
      logger.error(`Failed to delete invalid tokens: ${deleteError.message}`);
    }
  }
}
