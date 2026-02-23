import React, { useState, useEffect } from "react";
import {
  View,
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
import Toast from "react-native-toast-message";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  presentCustomerCenter,
} from "../services/purchases.service";
import { useIsPremium } from "../hooks/useIsPremium";
import { Colors, Borders, Spacing, Typography } from "../design";
import { Text } from "../components/primitives/Text";

export default function SubscriptionManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isPremium, willRenew, expirationDate } = useIsPremium();

  const [loading, setLoading] = useState(true);
  const [offerings, setOfferings] = useState<any>(null);
  const [currentPackageId, setCurrentPackageId] = useState<string | null>(null);
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
      const entitlement =
        customerInfo.entitlements.active["Instant Status Premium"];

      if (entitlement) {
        // Use productIdentifier to match with package.product.identifier
        setCurrentPackageId(entitlement.productIdentifier);
      } else {
        setCurrentPackageId(null);
      }
    } catch (error: any) {
      console.error("Error loading subscription data:", error);
      Toast.show({
        type: "error",
        text1:
          error.message ||
          "Failed to load subscription options. Please try again.",
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
      const allPkgs = (currentOffering?.availablePackages || []).filter(
        (p: any) => p && p.identifier && p.product,
      );

      // Store previous package for comparison
      const previousPkg = currentPackageId
        ? allPkgs.find((p: any) => p.product?.identifier === currentPackageId)
        : null;
      const previousLabel = previousPkg ? getPackageLabel(previousPkg) : null;

      const customerInfo = await purchasePackage(pkg);

      // Check if purchase was successful
      const entitlement =
        customerInfo.entitlements.active["Instant Status Premium"];
      if (entitlement) {
        const newPackageId = entitlement.productIdentifier;
        const newLabel = getPackageLabel(pkg);
        const isUpgrade = isUpgradePlan(previousLabel, newLabel);

        // Store plan change info
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
    if (
      fromLower.includes("monthly") &&
      (toLower.includes("yearly") || toLower.includes("lifetime"))
    ) {
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
        text1:
          error.message || "Failed to restore purchases. Please try again.",
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
      if (Platform.OS === "ios") {
        // iOS: Direct link to App Store subscription management
        await Linking.openURL("https://apps.apple.com/account/subscriptions");
      } else if (Platform.OS === "android") {
        // Android: Direct link to Play Store subscription management
        await Linking.openURL(
          "https://play.google.com/store/account/subscriptions",
        );
      } else {
        // Final fallback: Use RevenueCat Customer Center
        presentCustomerCenter();
      }
    } catch (error: any) {
      console.error("Error opening cancellation page:", error);
      Toast.show({
        type: "error",
        text1:
          error.message ||
          "Failed to open subscription settings. Please try again.",
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
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text variant="primary" style={styles.headerTitle}>
            Subscription
          </Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.interaction.primary} />
          <Text variant="secondary" style={styles.loadingText}>
            Loading subscription options...
          </Text>
        </View>
      </View>
    );
  }

  const currentOffering = offerings?.current;
  const allPackages = (currentOffering?.availablePackages || []).filter(
    (pkg: any) => pkg && pkg.identifier && pkg.product,
  );

  // Find current package by matching productIdentifier (not package identifier)
  // RevenueCat packages have identifiers like "$rc_monthly", but the entitlement.productIdentifier
  // is the actual product ID from App Store/Play Store, which matches pkg.product.identifier
  const currentPackage = currentPackageId
    ? allPackages.find(
        (pkg: any) =>
          pkg && pkg.product && pkg.product.identifier === currentPackageId,
      )
    : null;

  const hasLifetime =
    currentPackageId && currentPackage && isLifetimePackage(currentPackage);

  // Filter out current package - match by product identifier, not package identifier
  const availablePackages = allPackages.filter(
    (pkg: any) =>
      pkg && pkg.product && pkg.product.identifier !== currentPackageId,
  );

  // Find monthly and annual packages for savings calculation
  const monthlyPkg = allPackages.find(
    (pkg: any) =>
      pkg && pkg.identifier && pkg.identifier.toLowerCase().includes("monthly"),
  );
  const annualPkg = allPackages.find(
    (pkg: any) =>
      pkg &&
      pkg.identifier &&
      (pkg.identifier.toLowerCase().includes("annual") ||
        pkg.identifier.toLowerCase().includes("yearly")),
  );
  const savings = calculateSavings(monthlyPkg || null, annualPkg || null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text variant="primary" style={styles.headerTitle}>
          Subscription
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {/* Lifetime Access Message */}
        {hasLifetime && (
          <View style={styles.lifetimeCard}>
            <Ionicons
              name="infinite"
              size={32}
              color={Colors.interaction.primary}
            />
            <Text variant="primary" style={styles.lifetimeTitle}>
              You already have lifetime access to this app
            </Text>
            <Text variant="secondary" style={styles.lifetimeDescription}>
              Enjoy all premium features forever, no subscription needed.
            </Text>
          </View>
        )}

        {/* Current Plan Status (only for non-lifetime subscriptions) */}
        {isPremium && !hasLifetime && (
          <View style={styles.currentPlanCard}>
            <View style={styles.currentPlanHeader}>
              <Ionicons
                name="star"
                size={24}
                color={Colors.interaction.accent}
              />
              <Text variant="primary" style={styles.currentPlanTitle}>
                Current Plan
              </Text>
            </View>
            {currentPackageId && (
              <Text variant="primary" style={styles.currentPlanName}>
                {currentPackage ? getPackageLabel(currentPackage) : "Premium"}
              </Text>
            )}
            {expirationDate && (
              <Text variant="secondary" style={styles.expirationText}>
                Expires: {expirationDate.toLocaleDateString()}
              </Text>
            )}
            {willRenew === false && (
              <View style={styles.cancellationWarning}>
                <Ionicons
                  name="information-circle"
                  size={16}
                  color={Colors.interaction.accent}
                />
                <Text variant="primary" style={styles.cancellationWarningText}>
                  Your subscription will not renew
                </Text>
              </View>
            )}

            {/* Plan Switch Information */}
            {availablePackages.length > 0 &&
              currentPackage &&
              expirationDate && (
                <View style={styles.switchInfoBox}>
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={20}
                    color={Colors.interaction.primary}
                  />
                  <View style={styles.switchInfoContent}>
                    <Text variant="primary" style={styles.switchInfoTitle}>
                      Switching Plans
                    </Text>
                    <Text variant="secondary" style={styles.switchInfoText}>
                      {(() => {
                        const currentLabel = getPackageLabel(currentPackage);
                        const isYearly = currentLabel
                          .toLowerCase()
                          .includes("yearly");
                        const monthlyPkg = availablePackages.find((p: any) => {
                          const label = getPackageLabel(p);
                          return label.toLowerCase().includes("monthly");
                        });
                        const yearlyPkg = availablePackages.find((p: any) => {
                          const label = getPackageLabel(p);
                          return label.toLowerCase().includes("yearly");
                        });

                        if (isYearly && monthlyPkg) {
                          return `If you switch to Monthly, your Yearly benefits will continue until ${expirationDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. After that, your Monthly subscription will begin.`;
                        } else if (!isYearly && yearlyPkg) {
                          return `If you switch to Yearly, your remaining time will be prorated and applied to your new plan. Your next billing date will be in 1 year.`;
                        }
                        return `You can switch to a different plan anytime. Your current benefits will continue until ${expirationDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`;
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
            <Text variant="primary" style={styles.sectionTitle}>
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
                      <Text variant="primary" style={styles.packageLabel}>
                        {label}
                      </Text>
                      {isAnnual && savings && (
                        <View style={styles.savingsBadge}>
                          <Text
                            variant="primary"
                            style={styles.savingsBadgeText}
                          >
                            Save {savings.percentage}%
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text variant="primary" style={styles.packagePrice}>
                      {formatPrice(pkg)}
                    </Text>
                  </View>

                  {isAnnual && savings && (
                    <Text variant="secondary" style={styles.savingsText}>
                      {savings.percentage}% off compared to monthly billing
                    </Text>
                  )}

                  {isPurchasing ? (
                    <ActivityIndicator
                      size="small"
                      color={Colors.interaction.primary}
                      style={styles.packageButton}
                    />
                  ) : (
                    <View style={styles.packageButton}>
                      <Text variant="primary" style={styles.packageButtonText}>
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
              <ActivityIndicator
                size="small"
                color={Colors.interaction.primary}
              />
            ) : (
              <>
                <Ionicons
                  name="refresh-outline"
                  size={20}
                  color={Colors.interaction.primary}
                />
                <Text variant="primary" style={styles.actionButtonText}>
                  Restore Purchases
                </Text>
              </>
            )}
          </TouchableOpacity>

          {isPremium && !hasLifetime && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleCancelMembership}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={Colors.interaction.error}
              />
              <Text
                variant="primary"
                style={[styles.actionButtonText, styles.cancelButtonText]}
              >
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
                name={
                  planChangeInfo?.isUpgrade
                    ? "checkmark-circle"
                    : "information-circle"
                }
                size={48}
                color={
                  planChangeInfo?.isUpgrade
                    ? Colors.interaction.primary
                    : Colors.interaction.primary
                }
              />
              <Text variant="primary" style={styles.modalTitle}>
                {planChangeInfo?.isUpgrade
                  ? "Plan Upgraded Successfully!"
                  : "Plan Change Saved"}
              </Text>
            </View>

            <ScrollView
              style={styles.modalBody}
              keyboardShouldPersistTaps="always"
            >
              {planChangeInfo?.isUpgrade ? (
                <>
                  <Text variant="secondary" style={styles.modalMessage}>
                    Congratulations! You're now on the{" "}
                    <Text variant="primary" style={styles.boldText}>
                      {planChangeInfo.toPlan} Pro
                    </Text>{" "}
                    plan.
                  </Text>

                  <View style={styles.infoBox}>
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color={Colors.text.secondary}
                    />
                    <View style={styles.infoBoxContent}>
                      <Text variant="primary" style={styles.infoBoxTitle}>
                        Prorated Billing
                      </Text>
                      <Text variant="secondary" style={styles.infoBoxText}>
                        Your remaining time from the previous plan has been
                        applied to your new plan.
                      </Text>
                    </View>
                  </View>

                  {planChangeInfo.newExpirationDate && (
                    <View style={styles.infoBox}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={Colors.text.secondary}
                      />
                      <View style={styles.infoBoxContent}>
                        <Text variant="primary" style={styles.infoBoxTitle}>
                          Next Billing Date
                        </Text>
                        <Text variant="secondary" style={styles.infoBoxText}>
                          {planChangeInfo.newExpirationDate.toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            },
                          )}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text variant="secondary" style={styles.modalMessage}>
                    Your plan change from{" "}
                    <Text variant="primary" style={styles.boldText}>
                      {planChangeInfo?.fromPlan}
                    </Text>{" "}
                    to{" "}
                    <Text variant="primary" style={styles.boldText}>
                      {planChangeInfo?.toPlan}
                    </Text>{" "}
                    has been saved.
                  </Text>

                  <View style={styles.infoBox}>
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={Colors.interaction.accent}
                    />
                    <View style={styles.infoBoxContent}>
                      <Text variant="primary" style={styles.infoBoxTitle}>
                        Transition Process
                      </Text>
                      <Text variant="secondary" style={styles.infoBoxText}>
                        {planChangeInfo?.newExpirationDate
                          ? `Your current ${planChangeInfo.fromPlan} benefits will continue until ${planChangeInfo.newExpirationDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. After that date, your ${planChangeInfo.toPlan} subscription will begin.`
                          : `Your current plan benefits will continue until the end of your billing period. After that, your new ${planChangeInfo?.toPlan} subscription will begin.`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoBox}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={20}
                      color={Colors.interaction.primary}
                    />
                    <View style={styles.infoBoxContent}>
                      <Text variant="primary" style={styles.infoBoxTitle}>
                        Not a Cancellation
                      </Text>
                      <Text variant="secondary" style={styles.infoBoxText}>
                        Your subscription is not being cancelled. Only your
                        billing period is changing. You'll continue to have
                        access to all premium features.
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
              <Text variant="primary" style={styles.modalButtonText}>
                Got it
              </Text>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.canvas.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text.secondary + "40",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
  },
  currentPlanCard: {
    backgroundColor: Colors.canvas.background,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Borders.radius.medium,
    borderWidth: Borders.width,
    borderColor: Colors.interaction.accent + "40",
  },
  currentPlanHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  currentPlanTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  currentPlanName: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  expirationText: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  cancellationWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.interaction.accent + "20",
    borderWidth: 1,
    borderColor: Colors.interaction.accent + "60",
    borderRadius: Borders.radius.small,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  cancellationWarningText: {
    flex: 1,
    fontSize: 14,
    color: Colors.interaction.accent,
  },
  switchInfoBox: {
    flexDirection: "row",
    backgroundColor: Colors.interaction.primary + "15",
    borderWidth: 1,
    borderColor: Colors.interaction.primary + "40",
    borderRadius: Borders.radius.small,
    padding: Spacing.sm,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  switchInfoContent: {
    flex: 1,
  },
  switchInfoTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.interaction.primary,
    marginBottom: Spacing.xs,
  },
  switchInfoText: {
    fontSize: 13,
    lineHeight: 18,
  },
  lifetimeCard: {
    backgroundColor: Colors.canvas.background,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Borders.radius.medium,
    borderWidth: Borders.width,
    borderColor: Colors.interaction.primary,
    alignItems: "center",
  },
  lifetimeTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  lifetimeDescription: {
    fontSize: 14,
    marginTop: Spacing.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.md,
  },
  packageCard: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.medium,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary + "30",
  },
  packageCardCurrent: {
    borderColor: Colors.interaction.accent + "40",
    backgroundColor: Colors.interaction.accent + "15",
  },
  packageCardPurchasing: {
    opacity: 0.6,
  },
  packageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  packageInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  packageLabel: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
  },
  currentBadge: {
    backgroundColor: Colors.interaction.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Borders.radius.small,
  },
  currentBadgeText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.canvas.background,
  },
  savingsBadge: {
    backgroundColor: Colors.interaction.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Borders.radius.small,
  },
  savingsBadgeText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.canvas.background,
  },
  packagePrice: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
  },
  savingsText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.primary,
    marginBottom: Spacing.sm,
  },
  packageButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Borders.radius.small,
    backgroundColor: Colors.interaction.primary,
    alignItems: "center",
  },
  packageButtonCurrent: {
    backgroundColor: Colors.interaction.disabled,
  },
  packageButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.canvas.background,
  },
  packageButtonTextCurrent: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.secondary,
  },
  actionsSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary + "30",
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.primary,
  },
  cancelButton: {
    borderColor: Colors.interaction.error + "40",
    backgroundColor: Colors.interaction.error + "15",
  },
  cancelButtonText: {
    color: Colors.interaction.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.large,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.semiBold,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  modalBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    maxHeight: 400,
  },
  modalMessage: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  boldText: {
    fontFamily: Typography.fontFamily.semiBold,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  infoBoxContent: {
    flex: 1,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  infoBoxText: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalButton: {
    backgroundColor: Colors.interaction.primary,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    margin: Spacing.lg,
    marginTop: Spacing.sm,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.canvas.background,
  },
});
