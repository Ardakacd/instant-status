import PurchasesUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import Purchases, { CustomerInfo } from "react-native-purchases";
import Sentry from "../../sentry";

/**
 * Present the RevenueCat Paywall UI
 * This shows the UI you designed in the RevenueCat Dashboard
 *
 * @returns Promise that resolves to true if user purchased or restored, false otherwise
 * @throws Error if the paywall presentation fails
 */
export async function presentPaywall(): Promise<boolean> {
  try {
    // Present paywall for current offering
    const paywallResult: PAYWALL_RESULT = await PurchasesUI.presentPaywall();

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
    Sentry.Native.captureException(error);
    throw error;
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
    Sentry.Native.captureException(error);
    throw error;
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
    if (!offerings.current) {
      throw new Error("No current offering available");
    }
    return offerings;
  } catch (error) {
    Sentry.Native.captureException(error);
    throw error;
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
    Sentry.Native.captureException(error);
    throw error;
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
    Sentry.Native.captureException(error);
    throw error;
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
    Sentry.Native.captureException(error);
    throw error;
  }
}
