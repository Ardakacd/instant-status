import { useState, useEffect } from "react";
import Purchases, { CustomerInfo } from "react-native-purchases";
import { useAuth } from "../contexts/AuthContext";
import { widgetStorageService } from "../services/widget-storage.service";

export function useIsPremium() {
  const { user, loading: authLoading } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [willRenew, setWillRenew] = useState<boolean | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [managementURL, setManagementURL] = useState<string | null>(null);

  const updatePremiumState = (info: CustomerInfo) => {
    const entitlement = info.entitlements.active["Instant Status Premium"];
    const isActive = entitlement !== undefined;

    setIsPremium(isActive);
    widgetStorageService.setPremiumStatus(isActive);

    if (isActive) {
      setWillRenew(entitlement.willRenew ?? true);
      setExpirationDate(
        entitlement.expirationDate
          ? new Date(entitlement.expirationDate)
          : null
      );
    } else {
      setWillRenew(null);
      setExpirationDate(null);
    }

    setManagementURL(info.managementURL || null);
  };

  useEffect(() => {
    // Wait for AuthProvider to finish (Purchases.logIn, refreshUser, etc.)
    if (authLoading) return;

    const checkStatus = async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        updatePremiumState(info);
      } catch (e) {
        console.error("Failed to fetch customer info", e);
        setIsPremium(false);
        widgetStorageService.setPremiumStatus(false);
        setWillRenew(null);
        setExpirationDate(null);
        setManagementURL(null);
      } finally {
        setLoading(false);
      }
    };

    if (!user) {
      setIsPremium(false);
      widgetStorageService.setPremiumStatus(false);
      setWillRenew(null);
      setExpirationDate(null);
      setManagementURL(null);
      setLoading(false);
      return;
    }

    checkStatus();

    const listener = (info: CustomerInfo) => {
      updatePremiumState(info);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [user, authLoading]);

  return { isPremium, loading, willRenew, expirationDate, managementURL };
}
