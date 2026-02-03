import { useState, useEffect, useRef } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { auth } from '../config/firebase';

export function useIsPremium() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [willRenew, setWillRenew] = useState<boolean | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [managementURL, setManagementURL] = useState<string | null>(null);
  
  // Track previous values to avoid redundant backend calls
  const previousPremiumRef = useRef<boolean | null>(null);
  const previousExpirationRef = useRef<string | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const SYNC_COOLDOWN_MS = 5000; // Only sync once every 5 seconds max

  const updatePremiumStatus = async (info: CustomerInfo, forceSync = false) => {
    const entitlement = info.entitlements.active['Instant Status Premium'];
    const isActive = entitlement !== undefined;
    
    // Calculate expiration date string for comparison
    const newExpirationDate = entitlement?.expirationDate 
      ? new Date(entitlement.expirationDate).toISOString()
      : null;
    
    // Check if status has actually changed
    const statusChanged = 
      previousPremiumRef.current === null || // First time
      previousPremiumRef.current !== isActive ||
      previousExpirationRef.current !== newExpirationDate;
    
    // Check if enough time has passed since last sync
    const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
    const shouldSync = forceSync || (statusChanged && timeSinceLastSync > SYNC_COOLDOWN_MS);
    
    // Update local state immediately
    setIsPremium(isActive);
    
    if (isActive) {
      // Check if subscription will renew (false means cancelled but still active)
      setWillRenew(entitlement.willRenew ?? true);
      
      // Get expiration date
      if (entitlement.expirationDate) {
        setExpirationDate(new Date(entitlement.expirationDate));
      } else {
        setExpirationDate(null);
      }
    } else {
      setWillRenew(null);
      setExpirationDate(null);
    }
    
    // Get management URL for subscription management
    setManagementURL(info.managementURL || null);
    
    // Sync to backend only if status changed and user is logged in
    if (shouldSync) {
      // Check if user is logged in (not anonymous)
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log("Skipping premium sync: User not logged in");
        // Still update refs to track state
        previousPremiumRef.current = isActive;
        previousExpirationRef.current = newExpirationDate;
        return;
      }
      
      // Check if RevenueCat user ID is anonymous
      const revenuecatId = (info as any).originalAppUserId || (info as any).firstSeen || null;
      if (revenuecatId && typeof revenuecatId === 'string' && revenuecatId.includes('$RCAnonymousID')) {
        console.log("Skipping premium sync: RevenueCat user is anonymous");
        previousPremiumRef.current = isActive;
        previousExpirationRef.current = newExpirationDate;
        return;
      }
      
      // Sync premium status to backend
      // Note: Primary sync happens via RevenueCat webhooks
      // This is a fallback for immediate sync on login
      try {
        const { userService } = await import("../services/user.service");
        
        await userService.updatePremiumStatus(
          isActive,
          newExpirationDate,
          revenuecatId
        );
        
        // Update refs after successful sync
        previousPremiumRef.current = isActive;
        previousExpirationRef.current = newExpirationDate;
        lastSyncTimeRef.current = Date.now();
        
        console.log(`Premium status synced: ${isActive ? 'Premium' : 'Free'}${newExpirationDate ? ` until ${newExpirationDate}` : ''}`);
      } catch (error) {
        console.error("Failed to sync premium status to backend:", error);
        // Don't block UI if sync fails - webhooks will eventually sync
        // Still update refs to prevent retry spam
        previousPremiumRef.current = isActive;
        previousExpirationRef.current = newExpirationDate;
      }
    } else {
      // Status hasn't changed, just update refs
      previousPremiumRef.current = isActive;
      previousExpirationRef.current = newExpirationDate;
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        // Only force sync if user is already logged in
        const currentUser = auth.currentUser;
        updatePremiumStatus(info, !!currentUser);
      } catch (e) {
        console.error("Failed to fetch customer info", e);
        // Default to free tier if we can't fetch info (offline/error)
        // This is safer than accidentally giving premium access
        setIsPremium(false);
        setWillRenew(null);
        setExpirationDate(null);
        setManagementURL(null);
        previousPremiumRef.current = false;
        previousExpirationRef.current = null;
      } finally {
        setLoading(false);
      }
    };

    checkStatus();

    // Listen for real-time changes (e.g., user purchases or expires)
    const listener = (info: CustomerInfo) => {
      // Don't force sync on listener updates - let the change detection handle it
      updatePremiumStatus(info, false);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Listen for auth state changes to sync premium status when user logs in
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // User just logged in - force sync premium status
        try {
          const info = await Purchases.getCustomerInfo();
          updatePremiumStatus(info, true);
        } catch (error) {
          console.error("Failed to sync premium status after login:", error);
          // Don't block UI - status will sync on next check
        }
      } else {
        // User logged out - reset premium state
        setIsPremium(false);
        setWillRenew(null);
        setExpirationDate(null);
        setManagementURL(null);
        previousPremiumRef.current = null;
        previousExpirationRef.current = null;
        lastSyncTimeRef.current = 0;
      }
    });

    return unsubscribe;
  }, []);

  return { isPremium, loading, willRenew, expirationDate, managementURL };
}

