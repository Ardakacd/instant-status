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
import { Colors, Borders, Spacing, Typography, useResponsive } from "../design";
import { Text } from "../components/primitives/Text";
import { InfoBox } from "../components/feedback/InfoBox";

export default function SubscriptionManagementScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs } = useResponsive();
  const { isPremium, willRenew, expirationDate, managementURL } = useIsPremium();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);

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
      setLoadError(true);
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
    if (isCurrentPackage(pkg)) {
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
    return pkg?.product?.identifier === currentPackageId;
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

  if (loadError && !offerings) {
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
          <Text variant="secondary" style={styles.loadingText}>
            Failed to load subscription options.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadSubscriptionData}
          >
            <Text variant="primary" style={styles.retryButtonText}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentOffering = offerings?.current;
  const allPackages = (currentOffering?.availablePackages || []).filter(
    (pkg: any) => pkg && pkg.identifier && pkg.product,
  );

  const currentPackage = currentPackageId
    ? allPackages.find((pkg: any) => isCurrentPackage(pkg))
    : null;

  const hasLifetime =
    currentPackageId && currentPackage && isLifetimePackage(currentPackage);

  const availablePackages = allPackages.filter((pkg: any) => !isCurrentPackage(pkg));

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
        <Text variant="primary" style={[styles.headerTitle, { fontSize: fs(18) }]}>
          Subscription
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPadding, paddingTop: Spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {/* Lifetime Access Message */}
        {hasLifetime && (
          <View style={styles.lifetimeCard}>
            <Ionicons name="infinite" size={36} color={Colors.interaction.primary} />
            <Text variant="primary" style={[styles.lifetimeTitle, { fontSize: fs(20) }]}>
              Lifetime Access
            </Text>
            <Text variant="secondary" style={styles.lifetimeDescription}>
              All premium features, forever. No subscription needed.
            </Text>
          </View>
        )}

        {/* Current Plan Status (only for non-lifetime subscriptions) */}
        {isPremium && !hasLifetime && (
          <View style={styles.currentPlanCard}>
            <View style={styles.currentPlanTopRow}>
              <View style={styles.premiumPill}>
                <Ionicons name="star" size={12} color="#FFFFFF" />
                <Text style={styles.premiumPillText}>Premium</Text>
              </View>
              {willRenew === false && (
                <View style={styles.cancelledPill}>
                  <Text style={styles.cancelledPillText}>Cancels</Text>
                </View>
              )}
            </View>
            <Text variant="primary" style={[styles.currentPlanName, { fontSize: fs(24) }]}>
              {currentPackage ? getPackageLabel(currentPackage) : "Premium"}
            </Text>
            {expirationDate && (
              <Text variant="secondary" style={styles.expirationText}>
                {willRenew === false ? "Access until" : "Renews"}{" "}
                {expirationDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </Text>
            )}

            {/* Plan Switch Information */}
            {availablePackages.length > 0 && currentPackage && expirationDate && (
              <View style={styles.switchInfoBox}>
                <Ionicons name="swap-horizontal-outline" size={16} color={Colors.interaction.primary} />
                <Text variant="secondary" style={styles.switchInfoText}>
                  {(() => {
                    const currentLabel = getPackageLabel(currentPackage);
                    const isYearly = currentLabel.toLowerCase().includes("yearly");
                    const yearlyPkg = availablePackages.find((p: any) =>
                      getPackageLabel(p).toLowerCase().includes("yearly")
                    );
                    if (isYearly) {
                      return `Switching to Monthly takes effect after ${expirationDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`;
                    } else if (yearlyPkg) {
                      return `Switching to Yearly prorates your remaining time to the new plan.`;
                    }
                    return `Benefits continue until ${expirationDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`;
                  })()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Available Plans (only show if not lifetime and there are other plans) */}
        {!hasLifetime && availablePackages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isPremium ? "CHANGE PLAN" : "CHOOSE A PLAN"}
            </Text>

            {availablePackages.map((pkg: any) => {
              if (!pkg || !pkg.identifier) return null;
              const isPurchasing = purchasing === pkg.identifier;
              const label = getPackageLabel(pkg);
              const isAnnual = label.toLowerCase().includes("yearly");

              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[styles.packageCard, isPurchasing && styles.packageCardPurchasing]}
                  onPress={() => handlePurchasePackage(pkg)}
                  disabled={isPurchasing}
                  activeOpacity={0.75}
                >
                  <View style={styles.packageHeader}>
                    <View style={styles.packageInfo}>
                      <Text variant="primary" style={[styles.packageLabel, { fontSize: fs(17) }]}>
                        {label}
                      </Text>
                      {isAnnual && savings && (
                        <View style={styles.savingsBadge}>
                          <Text style={styles.savingsBadgeText}>
                            Save {savings.percentage}%
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.packagePriceCol}>
                      <Text variant="primary" style={[styles.packagePrice, { fontSize: fs(18) }]}>
                        {formatPrice(pkg)}
                      </Text>
                      {isAnnual && (
                        <Text variant="secondary" style={styles.packagePriceSub}>
                          per year
                        </Text>
                      )}
                    </View>
                  </View>

                  {isAnnual && savings && (
                    <Text style={styles.savingsText}>
                      {savings.percentage}% cheaper than monthly
                    </Text>
                  )}

                  <View style={styles.packageCta}>
                    {isPurchasing ? (
                      <ActivityIndicator size="small" color={Colors.interaction.primary} />
                    ) : (
                      <Text style={[styles.packageCtaText, { fontSize: fs(14) }]}>
                        {isPremium ? "Switch to this plan" : "Subscribe"} →
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>OTHER</Text>
          <View style={styles.actionsCard}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleRestorePurchases}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={Colors.interaction.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={18} color={Colors.interaction.primary} />
              )}
              <Text style={styles.actionRowText}>Restore Purchases</Text>
            </TouchableOpacity>

            {isPremium && !hasLifetime && (
              <>
                <View style={styles.actionDivider} />
                <TouchableOpacity style={styles.actionRow} onPress={handleCancelMembership}>
                  <Ionicons name="close-circle-outline" size={18} color={Colors.interaction.error} />
                  <Text style={[styles.actionRowText, styles.cancelText]}>Cancel Membership</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
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
                    : Colors.interaction.accent
                }
              />
              <Text variant="primary" style={[styles.modalTitle, { fontSize: fs(22) }]}>
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

                  <InfoBox
                    icon={
                      <Ionicons
                        name="time-outline"
                        size={20}
                        color={Colors.text.secondary}
                      />
                    }
                    style={styles.infoBoxSpacing}
                  >
                    <Text variant="primary" style={styles.infoBoxTitle}>
                      Prorated Billing
                    </Text>
                    <Text variant="secondary" style={styles.infoBoxText}>
                      Your remaining time from the previous plan has been
                      applied to your new plan.
                    </Text>
                  </InfoBox>

                  {planChangeInfo.newExpirationDate && (
                    <InfoBox
                      icon={
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color={Colors.text.secondary}
                        />
                      }
                      style={styles.infoBoxSpacing}
                    >
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
                    </InfoBox>
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

                  <InfoBox
                    icon={
                      <Ionicons
                        name="information-circle-outline"
                        size={20}
                        color={Colors.interaction.accent}
                      />
                    }
                    style={styles.infoBoxSpacing}
                  >
                    <Text variant="primary" style={styles.infoBoxTitle}>
                      Transition Process
                    </Text>
                    <Text variant="secondary" style={styles.infoBoxText}>
                      {planChangeInfo?.newExpirationDate
                        ? `Your current ${planChangeInfo.fromPlan} benefits will continue until ${planChangeInfo.newExpirationDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. After that date, your ${planChangeInfo.toPlan} subscription will begin.`
                        : `Your current plan benefits will continue until the end of your billing period. After that, your new ${planChangeInfo?.toPlan} subscription will begin.`}
                    </Text>
                  </InfoBox>

                  <InfoBox
                    icon={
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={20}
                        color={Colors.interaction.primary}
                      />
                    }
                    style={styles.infoBoxSpacing}
                  >
                    <Text variant="primary" style={styles.infoBoxTitle}>
                      Not a Cancellation
                    </Text>
                    <Text variant="secondary" style={styles.infoBoxText}>
                      Your subscription is not being cancelled. Only your
                      billing period is changing. You'll continue to have
                      access to all premium features.
                    </Text>
                  </InfoBox>
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
    backgroundColor: Colors.canvas.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.canvas.background,
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
  scrollContent: {
    paddingBottom: Spacing.xl,
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
  retryButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.interaction.primary,
    borderRadius: Borders.radius.medium,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.canvas.background,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.secondary,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  // Current plan card
  currentPlanCard: {
    backgroundColor: "#F0FDF8",
    borderRadius: Borders.radius.medium,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.interaction.primary + "30",
  },
  currentPlanTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.interaction.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  premiumPillText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#FFFFFF",
  },
  cancelledPill: {
    backgroundColor: Colors.interaction.error + "20",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  cancelledPillText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.error,
  },
  currentPlanName: {
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  expirationText: {
    fontSize: 14,
  },
  switchInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.interaction.primary + "40",
  },
  switchInfoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text.secondary,
  },
  // Lifetime card
  lifetimeCard: {
    backgroundColor: "#F0FDF8",
    borderRadius: Borders.radius.medium,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.interaction.primary + "40",
    alignItems: "center",
  },
  lifetimeTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  lifetimeDescription: {
    fontSize: 14,
    marginTop: Spacing.xs,
    textAlign: "center",
    lineHeight: 20,
  },
  // Plan section
  section: {
    marginTop: Spacing.lg,
  },
  packageCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  packageCardPurchasing: {
    opacity: 0.6,
  },
  packageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  packageInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  packageLabel: {
    fontFamily: Typography.fontFamily.semiBold,
  },
  savingsBadge: {
    backgroundColor: Colors.interaction.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  savingsBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#FFFFFF",
  },
  packagePriceCol: {
    alignItems: "flex-end",
  },
  packagePrice: {
    fontFamily: Typography.fontFamily.semiBold,
  },
  packagePriceSub: {
    fontSize: 11,
    marginTop: 1,
  },
  savingsText: {
    fontSize: 13,
    color: Colors.interaction.primary,
    marginBottom: Spacing.sm,
  },
  packageCta: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.text.secondary + "30",
  },
  packageCtaText: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.primary,
  },
  // Actions
  actionsSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  actionsCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minHeight: 48,
    paddingVertical: Spacing.xs,
  },
  actionRowText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.primary,
  },
  cancelText: {
    color: Colors.interaction.error,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.text.secondary + "30",
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
  infoBoxSpacing: {
    marginBottom: Spacing.sm,
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
