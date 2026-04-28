import { Platform } from "react-native";
import PurchasesUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import Purchases, { CustomerInfo } from "react-native-purchases";
import Sentry from "../../sentry";

const PAYWALL_OFFERING_ID = Platform.OS === "android" ? "default_android" : "default";

/**
 * Pick the offering matching the current platform.
 * Falls back to offerings.current if the platform-specific ID is not found.
 */
export function getPlatformOffering(offerings: { all: Record<string, any>; current: any }) {
  return offerings.all[PAYWALL_OFFERING_ID] ?? offerings.current;
}

/**
 * Present the RevenueCat Paywall UI
 * This shows the UI you designed in the RevenueCat Dashboard
 *
 * @returns Promise that resolves to true if user purchased or restored, false otherwise
 * @throws Error if the paywall presentation fails
 */
export async function presentPaywall(): Promise<boolean> {
  try {
    const offerings = await Purchases.getOfferings();
    const offering = getPlatformOffering(offerings);
    if (!offering) {
      throw new Error("No subscription plans are available right now. Please try again later.");
    }

    const paywallResult: PAYWALL_RESULT = await PurchasesUI.presentPaywall({ offering });

    switch (paywallResult) {
      case PAYWALL_RESULT.NOT_PRESENTED:
      case PAYWALL_RESULT.ERROR:
      case PAYWALL_RESULT.CANCELLED:
        return false;
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
        return true;
      default:
        return false;
    }
  } catch (error) {
    Sentry.captureException(error);
    throw new Error("Failed to open subscription options. Please try again.");
  }
}

/**
 * Present the RevenueCat Customer Center
 * Opens the self-service portal for managing subscriptions (cancel, restore, or change plans)
 *
 * @throws Error if the customer center presentation fails
 */
export function presentCustomerCenter(): void {
  try {
    PurchasesUI.presentCustomerCenter();
  } catch (error) {
    Sentry.captureException(error);
    throw new Error("Failed to open subscription settings. Please try again.");
  }
}

/**
 * Get current offerings and available packages
 * @returns Promise that resolves to Offerings object
 * @throws Error if offerings cannot be fetched
 */
export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    if (!getPlatformOffering(offerings)) {
      throw new Error("No subscription plans are available right now. Please try again later.");
    }
    return offerings;
  } catch (error: any) {
    // Re-throw our own controlled errors as-is — don't report expected states to Sentry
    if (error.message?.includes("No subscription plans")) {
      throw error;
    }
    Sentry.captureException(error);
    throw new Error("Failed to load subscription options. Please try again.");
  }
}

/**
 * Purchase a specific package
 * RevenueCat handles upgrade/downgrade automatically
 * @param pkg The package to purchase
 * @returns Promise that resolves to CustomerInfo after purchase
 * @throws Error if purchase fails
 */
export async function purchasePackage(pkg: any): Promise<CustomerInfo> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (error: any) {
    if (error.userCancelled) {
      throw new Error("Purchase cancelled by user");
    }
    Sentry.captureException(error);
    throw new Error("Failed to complete purchase. Please try again.");
  }
}

/**
 * Restore previous purchases
 * Useful when user switches devices or reinstalls app
 * @returns Promise that resolves to CustomerInfo
 * @throws Error if restore fails
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (error) {
    Sentry.captureException(error);
    throw new Error("Failed to restore purchases. Please try again.");
  }
}

/**
 * Get current customer info
 * @returns Promise that resolves to CustomerInfo
 * @throws Error if customer info cannot be fetched
 */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    Sentry.captureException(error);
    throw new Error("Failed to load subscription status. Please try again.");
  }
}
