import { useState, useEffect } from "react";
import Purchases, { CustomerInfo } from "react-native-purchases";
import { useAuth } from "../contexts/AuthContext";
import { widgetStorageService } from "../services/widget-storage.service";
import { getLoggingOut } from "../config/api";
import { auth } from "../config/firebase";
import Sentry from "../../sentry";

export function useIsPremium() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [willRenew, setWillRenew] = useState<boolean | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [managementURL, setManagementURL] = useState<string | null>(null);
  const [rcHasEntitlement, setRcHasEntitlement] = useState(false);

  const isSubscriptionActive = user?.is_premium ?? false;
  const isInGracePeriod = user?.is_in_grace_period ?? false;
  /** Matches API feature gating (active subscription or 3-day grace). */
  const hasPremiumAccess = isSubscriptionActive || isInGracePeriod || rcHasEntitlement;

  // Keep widget storage in sync — widgets should reflect the same access level as the API
  useEffect(() => {
    widgetStorageService.setPremiumStatus(hasPremiumAccess);
  }, [hasPremiumAccess]);

  // Fetch display-only fields from RevenueCat (willRenew, expirationDate, managementURL)
  // These are not used to gate features — only for showing plan details in the UI
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setWillRenew(null);
      setExpirationDate(null);
      setManagementURL(null);
      return;
    }

    const updateDisplayFields = (info: CustomerInfo) => {
      const entitlement = info.entitlements.active["Instant Status Premium"];
      setRcHasEntitlement(!!entitlement);
      if (entitlement) {
        setWillRenew(entitlement.willRenew ?? true);
        setExpirationDate(
          entitlement.expirationDate
            ? new Date(entitlement.expirationDate)
            : null
        );
        setManagementURL(info.managementURL || null);
      } else {
        setWillRenew(null);
        setExpirationDate(null);
        setManagementURL(null);
      }
    };

    Purchases.getCustomerInfo()
      .then(updateDisplayFields)
      .catch((error) => { Sentry.captureException(error); });

    // When RevenueCat detects a subscription change, resync with backend.
    // Skip during logout: Purchases.logOut() also fires this listener, and refreshing
    // here repopulates the user state milliseconds before Firebase signs out, briefly
    // bouncing the user back to the home screen.
    const listener = (info: CustomerInfo) => {
      updateDisplayFields(info);
      if (getLoggingOut() || !auth.currentUser) return;
      refreshUser();
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
  }, [user, authLoading]);

  return {
    /** Same as `hasPremiumAccess` — use for feature gating / widgets. */
    isPremium: hasPremiumAccess,
    hasPremiumAccess,
    /** Strict backend flag: paid period not expired (no grace). Use for copy like “renew” vs “manage”. */
    isSubscriptionActive,
    isInGracePeriod,
    loading: authLoading,
    willRenew,
    expirationDate,
    managementURL,
  };
}
