import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Purchases, { CustomerInfo } from "react-native-purchases";
import Toast from "react-native-toast-message";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  presentCustomerCenter,
} from "../services/purchases.service";
import { useIsPremium } from "../hooks/useIsPremium";

export default function SubscriptionManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isPremium, willRenew, expirationDate, managementURL } = useIsPremium();

  const [loading, setLoading] = useState(true);
  const [offerings, setOfferings] = useState<any>(null);
  const [currentPackageId, setCurrentPackageId] = useState<string | null>(null);
  const [previousPackageId, setPreviousPackageId] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [planChangeModalVisible, setPlanChangeModalVisible] = useState(false);
  const [planChangeInfo, setPlanChangeInfo] = useState<{
    fromPlan: string;
    toPlan: string;
    isUpgrade: boolean;
    newExpirationDate?: Date;
  } | null>(null);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    try {
      setLoading(true);
      
      // Get offerings
      const offeringsData = await getOfferings();
      setOfferings(offeringsData);

      // Get current customer info to find active package
      const customerInfo = await getCustomerInfo();
      const entitlement = customerInfo.entitlements.active['Instant Status Premium'];
      
      if (entitlement) {
        // Use productIdentifier to match with package.product.identifier
        setCurrentPackageId(entitlement.productIdentifier);
        console.log("Current package productIdentifier:", entitlement.productIdentifier);
      } else {
        setCurrentPackageId(null);
      }
    } catch (error: any) {
      console.error("Error loading subscription data:", error);
      Toast.show({
        type: "error",
        text1: error.message || "Failed to load subscription options. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchasePackage = async (pkg: any) => {
    // Don't allow purchasing the same package (check by product identifier)
    if (pkg.product && pkg.product.identifier === currentPackageId) {
      Toast.show({
        type: "info",
        text1: "This is your current plan",
      });
      return;
    }

    try {
      setPurchasing(pkg.identifier);
      
      // Get current packages for comparison
      const currentOffering = offerings?.current;
      const allPkgs = (currentOffering?.availablePackages || []).filter((p: any) => p && p.identifier && p.product);
      
      // Store previous package for comparison
      const previousPkg = currentPackageId 
        ? allPkgs.find((p: any) => p.product?.identifier === currentPackageId)
        : null;
      const previousLabel = previousPkg ? getPackageLabel(previousPkg) : null;
      
      const customerInfo = await purchasePackage(pkg);
      
      // Check if purchase was successful
      const entitlement = customerInfo.entitlements.active['Instant Status Premium'];
      if (entitlement) {
        const newPackageId = entitlement.productIdentifier;
        const newLabel = getPackageLabel(pkg);
        const isUpgrade = isUpgradePlan(previousLabel, newLabel);
        
        // Store plan change info
        setPreviousPackageId(currentPackageId);
        setCurrentPackageId(newPackageId);
        
        // Get new expiration date
        const newExpirationDate = entitlement.expirationDate 
          ? new Date(entitlement.expirationDate)
          : undefined;
        
        // Show plan change modal with details
        setPlanChangeInfo({
          fromPlan: previousLabel || "Free",
          toPlan: newLabel,
          isUpgrade,
          newExpirationDate,
        });
        setPlanChangeModalVisible(true);
        
        // Reload data to reflect changes
        await loadSubscriptionData();
      } else {
        // Still reload to get updated state
        await loadSubscriptionData();
      }
    } catch (error: any) {
      if (error.message?.includes("cancelled")) {
        // User cancelled - don't show error
        return;
      }
      Toast.show({
        type: "error",
        text1: error.message || "Failed to update plan. Please try again.",
      });
    } finally {
      setPurchasing(null);
    }
  };

  const isUpgradePlan = (fromPlan: string | null, toPlan: string): boolean => {
    if (!fromPlan) return true; // From free is always upgrade
    
    const fromLower = fromPlan.toLowerCase();
    const toLower = toPlan.toLowerCase();
    
    // Monthly -> Yearly or Lifetime = upgrade
    if (fromLower.includes("monthly") && (toLower.includes("yearly") || toLower.includes("lifetime"))) {
      return true;
    }
    // Yearly -> Lifetime = upgrade
    if (fromLower.includes("yearly") && toLower.includes("lifetime")) {
      return true;
    }
    // Everything else is downgrade or same tier
    return false;
  };

  const handleRestorePurchases = async () => {
    try {
      setRestoring(true);
      await restorePurchases();
      Toast.show({
        type: "success",
        text1: "Purchases restored successfully",
      });
      // Reload data
      await loadSubscriptionData();
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to restore purchases. Please try again.",
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleCancelMembership = async () => {
    try {
      // Try to get the management URL from RevenueCat
      const customerInfo = await getCustomerInfo();
      const managementURL = customerInfo.managementURL;

      if (managementURL) {
        // RevenueCat provides a direct link to subscription management
        const canOpen = await Linking.canOpenURL(managementURL);
        if (canOpen) {
          await Linking.openURL(managementURL);
          return;
        }
      }

      // Fallback: Use platform-specific subscription management URLs
      if (Platform.OS === 'ios') {
        // iOS: Direct link to App Store subscription management
        await Linking.openURL('https://apps.apple.com/account/subscriptions');
      } else if (Platform.OS === 'android') {
        // Android: Direct link to Play Store subscription management
        await Linking.openURL('https://play.google.com/store/account/subscriptions');
      } else {
        // Final fallback: Use RevenueCat Customer Center
        presentCustomerCenter();
      }
    } catch (error: any) {
      console.error("Error opening cancellation page:", error);
      Toast.show({
        type: "error",
        text1: error.message || "Failed to open subscription settings. Please try again.",
      });
    }
  };

  const formatPrice = (pkg: any) => {
    if (!pkg || !pkg.product || !pkg.product.priceString) return "N/A";
    return pkg.product.priceString;
  };

  const getPackageLabel = (pkg: any) => {
    if (!pkg || !pkg.identifier) return "Unknown";
    // Extract readable name from package identifier
    const identifier = pkg.identifier.toLowerCase();
    if (identifier.includes("monthly")) {
      return "Monthly";
    } else if (identifier.includes("annual") || identifier.includes("yearly")) {
      return "Yearly";
    } else if (identifier.includes("lifetime")) {
      return "Lifetime";
    } else if (identifier.includes("weekly")) {
      return "Weekly";
    }
    return pkg.packageType || "Unknown";
  };

  const isLifetimePackage = (pkg: any) => {
    if (!pkg || !pkg.identifier) return false;
    const identifier = pkg.identifier.toLowerCase();
    return identifier.includes("lifetime");
  };

  const isCurrentPackage = (pkg: any) => {
    return pkg.identifier === currentPackageId;
  };

  const calculateSavings = (monthlyPkg: any | null, annualPkg: any | null) => {
    if (!monthlyPkg || !annualPkg) return null;
    
    const monthlyPrice = monthlyPkg.product.price;
    const annualPrice = annualPkg.product.price;
    const monthlyYearlyTotal = monthlyPrice * 12;
    
    if (annualPrice < monthlyYearlyTotal) {
      const savings = monthlyYearlyTotal - annualPrice;
      const percentage = Math.round((savings / monthlyYearlyTotal) * 100);
      return { amount: savings, percentage };
    }
    return null;
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading subscription options...</Text>
        </View>
      </View>
    );
  }

  const currentOffering = offerings?.current;
  const allPackages = (currentOffering?.availablePackages || []).filter((pkg: any) => pkg && pkg.identifier && pkg.product);
  
  // Find current package by matching productIdentifier (not package identifier)
  // RevenueCat packages have identifiers like "$rc_monthly", but the entitlement.productIdentifier
  // is the actual product ID from App Store/Play Store, which matches pkg.product.identifier
  const currentPackage = currentPackageId 
    ? allPackages.find((pkg: any) => 
        pkg && 
        pkg.product && 
        pkg.product.identifier === currentPackageId
      )
    : null;
  
  console.log("Current packageId:", currentPackageId);
  console.log("Current package found:", currentPackage ? currentPackage.identifier : "not found");
  console.log("All packages:", allPackages.map((pkg: any) => ({
    packageId: pkg.identifier,
    productId: pkg.product?.identifier
  })));
  
  const hasLifetime = currentPackageId && currentPackage && isLifetimePackage(currentPackage);
  
  // Filter out current package - match by product identifier, not package identifier
  const availablePackages = allPackages.filter((pkg: any) => 
    pkg && 
    pkg.product && 
    pkg.product.identifier !== currentPackageId
  );
  
  // Find monthly and annual packages for savings calculation
  const monthlyPkg = allPackages.find((pkg: any) =>
    pkg && pkg.identifier && pkg.identifier.toLowerCase().includes("monthly")
  );
  const annualPkg = allPackages.find((pkg: any) =>
    pkg && pkg.identifier && (
      pkg.identifier.toLowerCase().includes("annual") ||
      pkg.identifier.toLowerCase().includes("yearly")
    )
  );
  const savings = calculateSavings(monthlyPkg || null, annualPkg || null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Lifetime Access Message */}
        {hasLifetime && (
          <View style={styles.lifetimeCard}>
            <Ionicons name="infinite" size={32} color="#10B981" />
            <Text style={styles.lifetimeTitle}>You already have lifetime access to this app</Text>
            <Text style={styles.lifetimeDescription}>
              Enjoy all premium features forever, no subscription needed.
            </Text>
          </View>
        )}

        {/* Current Plan Status (only for non-lifetime subscriptions) */}
        {isPremium && !hasLifetime && (
          <View style={styles.currentPlanCard}>
            <View style={styles.currentPlanHeader}>
              <Ionicons name="star" size={24} color="#FFD700" />
              <Text style={styles.currentPlanTitle}>Current Plan</Text>
            </View>
            {currentPackageId && (
              <Text style={styles.currentPlanName}>
                {currentPackage 
                  ? getPackageLabel(currentPackage)
                  : "Premium" // Fallback if package not found
                }
              </Text>
            )}
            {expirationDate && (
              <Text style={styles.expirationText}>
                Expires: {expirationDate.toLocaleDateString()}
              </Text>
            )}
            {willRenew === false && (
              <View style={styles.cancellationWarning}>
                <Ionicons name="information-circle" size={16} color="#F59E0B" />
                <Text style={styles.cancellationWarningText}>
                  Your subscription will not renew
                </Text>
              </View>
            )}
            
            {/* Plan Switch Information */}
            {availablePackages.length > 0 && currentPackage && expirationDate && (
              <View style={styles.switchInfoBox}>
                <Ionicons name="swap-horizontal-outline" size={20} color="#007AFF" />
                <View style={styles.switchInfoContent}>
                  <Text style={styles.switchInfoTitle}>Switching Plans</Text>
                  <Text style={styles.switchInfoText}>
                    {(() => {
                      const currentLabel = getPackageLabel(currentPackage);
                      const isYearly = currentLabel.toLowerCase().includes("yearly");
                      const monthlyPkg = availablePackages.find((p: any) => {
                        const label = getPackageLabel(p);
                        return label.toLowerCase().includes("monthly");
                      });
                      const yearlyPkg = availablePackages.find((p: any) => {
                        const label = getPackageLabel(p);
                        return label.toLowerCase().includes("yearly");
                      });
                      
                      if (isYearly && monthlyPkg) {
                        return `If you switch to Monthly, your Yearly benefits will continue until ${expirationDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. After that, your Monthly subscription will begin.`;
                      } else if (!isYearly && yearlyPkg) {
                        return `If you switch to Yearly, your remaining time will be prorated and applied to your new plan. Your next billing date will be in 1 year.`;
                      }
                      return `You can switch to a different plan anytime. Your current benefits will continue until ${expirationDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`;
                    })()}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Available Plans (only show if not lifetime and there are other plans) */}
        {!hasLifetime && availablePackages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isPremium ? "Change Plan" : "Choose a Plan"}
            </Text>
            
            {availablePackages.map((pkg: any) => {
              if (!pkg || !pkg.identifier) return null;
              const isPurchasing = purchasing === pkg.identifier;
              const label = getPackageLabel(pkg);
              const isAnnual = label.toLowerCase().includes("yearly");
              
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.packageCard,
                    isPurchasing && styles.packageCardPurchasing,
                  ]}
                  onPress={() => handlePurchasePackage(pkg)}
                  disabled={isPurchasing}
                >
                  <View style={styles.packageHeader}>
                    <View style={styles.packageInfo}>
                      <Text style={styles.packageLabel}>{label}</Text>
                      {isAnnual && savings && (
                        <View style={styles.savingsBadge}>
                          <Text style={styles.savingsBadgeText}>
                            Save {savings.percentage}%
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.packagePrice}>{formatPrice(pkg)}</Text>
                  </View>
                  
                  {isAnnual && savings && (
                    <Text style={styles.savingsText}>
                      {savings.percentage}% off compared to monthly billing
                    </Text>
                  )}

                  {isPurchasing ? (
                    <ActivityIndicator size="small" color="#007AFF" style={styles.packageButton} />
                  ) : (
                    <View style={styles.packageButton}>
                      <Text style={styles.packageButtonText}>
                        {isPremium ? "Switch to this plan" : "Subscribe"}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRestorePurchases}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={20} color="#007AFF" />
                <Text style={styles.actionButtonText}>Restore Purchases</Text>
              </>
            )}
          </TouchableOpacity>

          {isPremium && !hasLifetime && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleCancelMembership}
            >
              <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
              <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                Cancel Membership
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Plan Change Success Modal */}
      <Modal
        visible={planChangeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPlanChangeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons 
                name={planChangeInfo?.isUpgrade ? "checkmark-circle" : "information-circle"} 
                size={48} 
                color={planChangeInfo?.isUpgrade ? "#10B981" : "#007AFF"} 
              />
              <Text style={styles.modalTitle}>
                {planChangeInfo?.isUpgrade 
                  ? "Plan Upgraded Successfully!" 
                  : "Plan Change Saved"}
              </Text>
            </View>

            <ScrollView style={styles.modalBody}>
              {planChangeInfo?.isUpgrade ? (
                <>
                  <Text style={styles.modalMessage}>
                    Congratulations! You're now on the <Text style={styles.boldText}>{planChangeInfo.toPlan} Pro</Text> plan.
                  </Text>
                  
                  <View style={styles.infoBox}>
                    <Ionicons name="time-outline" size={20} color="#6B7280" />
                    <View style={styles.infoBoxContent}>
                      <Text style={styles.infoBoxTitle}>Prorated Billing</Text>
                      <Text style={styles.infoBoxText}>
                        Your remaining time from the previous plan has been applied to your new plan.
                      </Text>
                    </View>
                  </View>

                  {planChangeInfo.newExpirationDate && (
                    <View style={styles.infoBox}>
                      <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                      <View style={styles.infoBoxContent}>
                        <Text style={styles.infoBoxTitle}>Next Billing Date</Text>
                        <Text style={styles.infoBoxText}>
                          {planChangeInfo.newExpirationDate.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.modalMessage}>
                    Your plan change from <Text style={styles.boldText}>{planChangeInfo?.fromPlan}</Text> to <Text style={styles.boldText}>{planChangeInfo?.toPlan}</Text> has been saved.
                  </Text>
                  
                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={20} color="#F59E0B" />
                    <View style={styles.infoBoxContent}>
                      <Text style={styles.infoBoxTitle}>Transition Process</Text>
                      <Text style={styles.infoBoxText}>
                        {planChangeInfo?.newExpirationDate 
                          ? `Your current ${planChangeInfo.fromPlan} benefits will continue until ${planChangeInfo.newExpirationDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. After that date, your ${planChangeInfo.toPlan} subscription will begin.`
                          : `Your current plan benefits will continue until the end of your billing period. After that, your new ${planChangeInfo?.toPlan} subscription will begin.`
                        }
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoBox}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
                    <View style={styles.infoBoxContent}>
                      <Text style={styles.infoBoxTitle}>Not a Cancellation</Text>
                      <Text style={styles.infoBoxText}>
                        Your subscription is not being cancelled. Only your billing period is changing. You'll continue to have access to all premium features.
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setPlanChangeModalVisible(false);
                setPlanChangeInfo(null);
              }}
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: "#6B7280",
  },
  currentPlanCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FEF3C7",
  },
  currentPlanHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  currentPlanTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  currentPlanName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  expirationText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  cancellationWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  cancellationWarningText: {
    flex: 1,
    fontSize: 14,
    color: "#92400E",
  },
  switchInfoBox: {
    flexDirection: "row",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    gap: 12,
  },
  switchInfoContent: {
    flex: 1,
  },
  switchInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
    marginBottom: 4,
  },
  switchInfoText: {
    fontSize: 13,
    color: "#1E3A8A",
    lineHeight: 18,
  },
  lifetimeCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#10B981",
    alignItems: "center",
  },
  lifetimeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
    textAlign: "center",
  },
  lifetimeDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  packageCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  packageCardCurrent: {
    borderColor: "#FEF3C7",
    backgroundColor: "#FFFBEB",
  },
  packageCardPurchasing: {
    opacity: 0.6,
  },
  packageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  packageInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  packageLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  currentBadge: {
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  savingsBadge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  savingsBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  packagePrice: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  savingsText: {
    fontSize: 14,
    color: "#10B981",
    fontWeight: "500",
    marginBottom: 12,
  },
  packageButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  packageButtonCurrent: {
    backgroundColor: "#E5E7EB",
  },
  packageButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  packageButtonTextCurrent: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  actionsSection: {
    marginTop: 24,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#007AFF",
  },
  cancelButton: {
    borderColor: "#FEE2E2",
    backgroundColor: "#FEF2F2",
  },
  cancelButtonText: {
    color: "#EF4444",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    // No shadows, no elevation - using physical shift transform instead
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
    textAlign: "center",
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    maxHeight: 400,
  },
  modalMessage: {
    fontSize: 16,
    color: "#374151",
    lineHeight: 24,
    marginBottom: 20,
    textAlign: "center",
  },
  boldText: {
    fontWeight: "700",
    color: "#111827",
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  infoBoxContent: {
    flex: 1,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  infoBoxText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  modalButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    margin: 24,
    marginTop: 8,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

