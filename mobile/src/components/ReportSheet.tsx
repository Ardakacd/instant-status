import React, { useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  ActivityIndicator,
  TextInput as RNTextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { submitReport, ReportReason } from "../services/reports.service";
import { toast } from "../utils/toast";
import Sentry from "../../sentry";
import {
  Colors,
  Borders,
  Spacing,
  Typography,
  SAFE_AREA_BOTTOM,
  useResponsive,
  useColors,
} from "../design";
import { Text } from "./primitives/Text";
import { Button } from "./actions/Button";

const DETAILS_MAX_LENGTH = 2000;

interface ReasonOption {
  value: ReportReason;
  label: string;
  description: string;
}

const REASON_OPTIONS: ReasonOption[] = [
  {
    value: "child_safety",
    label: "Child safety concern",
    description: "Content that exploits or endangers minors",
  },
  {
    value: "harassment",
    label: "Harassment or bullying",
    description: "Threatening, intimidating, or abusive behavior",
  },
  {
    value: "impersonation",
    label: "Impersonation",
    description: "Pretending to be someone else",
  },
  {
    value: "spam",
    label: "Spam",
    description: "Unsolicited or repetitive content",
  },
  {
    value: "inappropriate_content",
    label: "Inappropriate content",
    description: "Content that violates community guidelines",
  },
  {
    value: "other",
    label: "Other",
    description: "Something else not listed above",
  },
];

interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  reportedUserId?: string;
  reportedUserName?: string;
}

export default function ReportSheet({
  visible,
  onClose,
  reportedUserId,
  reportedUserName,
}: ReportSheetProps) {
  const insets = useSafeAreaInsets();
  const { fs } = useResponsive();
  const colors = useColors();

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setSelectedReason(null);
    setDetails("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedReason || submitting) return;

    setSubmitting(true);
    try {
      await submitReport({
        reason: selectedReason,
        reported_user_id: reportedUserId,
        details: details.trim() || undefined,
      });
      setSelectedReason(null);
      setDetails("");
      onClose();
      toast.show({
        type: "success",
        text1: "Report submitted. Our safety team will review it.",
      });
    } catch (error: any) {
      Sentry.captureException(error);
      toast.show({
        type: "error",
        text1: error.message || "Failed to submit report. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.canvas.background,
                  paddingBottom: SAFE_AREA_BOTTOM + insets.bottom,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerTextBlock}>
                  <Text
                    variant="primary"
                    style={[styles.headerTitle, { fontSize: fs(18) }]}
                  >
                    {reportedUserName
                      ? `Report ${reportedUserName}`
                      : "Report a safety concern"}
                  </Text>
                  <Text variant="secondary" style={styles.headerSubtitle}>
                    Reports are confidential and reviewed by our safety team.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  disabled={submitting}
                  style={styles.closeButton}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                >
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
              >
                {/* Reason section */}
                <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>
                  REASON
                </Text>
                <View
                  style={[
                    styles.reasonsCard,
                    { backgroundColor: colors.canvas.card },
                  ]}
                >
                  {REASON_OPTIONS.map((option, index) => {
                    const isSelected = selectedReason === option.value;
                    const isLast = index === REASON_OPTIONS.length - 1;
                    return (
                      <React.Fragment key={option.value}>
                        <TouchableOpacity
                          style={styles.reasonRow}
                          onPress={() => setSelectedReason(option.value)}
                          activeOpacity={0.7}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={`${option.label}: ${option.description}`}
                        >
                          <View style={styles.reasonTextBlock}>
                            <Text
                              variant="primary"
                              style={styles.reasonLabel}
                            >
                              {option.label}
                            </Text>
                            <Text
                              variant="secondary"
                              style={styles.reasonDescription}
                              numberOfLines={2}
                            >
                              {option.description}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.radioOuter,
                              {
                                borderColor: isSelected
                                  ? colors.interaction.primary
                                  : colors.text.secondary + "60",
                              },
                            ]}
                          >
                            {isSelected && (
                              <View
                                style={[
                                  styles.radioInner,
                                  { backgroundColor: colors.interaction.primary },
                                ]}
                              />
                            )}
                          </View>
                        </TouchableOpacity>
                        {!isLast && (
                          <View
                            style={[
                              styles.divider,
                              { backgroundColor: colors.text.secondary + "30" },
                            ]}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>

                {/* Details section */}
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: colors.text.secondary, marginTop: Spacing.lg },
                  ]}
                >
                  ADDITIONAL DETAILS (OPTIONAL)
                </Text>
                <View
                  style={[
                    styles.detailsInputWrapper,
                    {
                      backgroundColor: colors.canvas.background,
                      borderColor: colors.text.secondary + "40",
                    },
                  ]}
                >
                  <RNTextInput
                    value={details}
                    onChangeText={(t) =>
                      setDetails(t.slice(0, DETAILS_MAX_LENGTH))
                    }
                    placeholder="Describe what happened..."
                    placeholderTextColor={colors.text.secondary}
                    multiline
                    maxLength={DETAILS_MAX_LENGTH}
                    textAlignVertical="top"
                    style={[
                      styles.detailsInput,
                      { color: colors.text.primary, fontSize: fs(15) },
                    ]}
                    selectionColor={colors.interaction.primary}
                    editable={!submitting}
                    accessibilityLabel="Additional details"
                  />
                </View>
                <Text
                  variant="hint"
                  style={[styles.charCount, { color: colors.text.secondary }]}
                >
                  {details.length}/{DETAILS_MAX_LENGTH}
                </Text>
              </ScrollView>

              {/* Footer */}
              <View style={styles.footer}>
                <Button
                  variant="secondary"
                  onPress={handleClose}
                  disabled={submitting}
                  style={styles.cancelButton}
                >
                  Cancel
                </Button>
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    {
                      backgroundColor: !selectedReason || submitting
                        ? colors.interaction.disabled
                        : Colors.interaction.primary,
                    },
                  ]}
                  onPress={handleSubmit}
                  disabled={!selectedReason || submitting}
                  activeOpacity={0.85}
                  accessibilityLabel="Submit report"
                  accessibilityRole="button"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerTextBlock: {
    flex: 1,
    gap: 4,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.semiBold,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    padding: Spacing.xs,
    marginTop: 2,
  },
  scrollView: {
    flexGrow: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs + 2,
  },
  reasonsCard: {
    borderRadius: Borders.radius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  reasonTextBlock: {
    flex: 1,
    gap: 2,
  },
  reasonLabel: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
  },
  reasonDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  detailsInputWrapper: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    minHeight: 100,
  },
  detailsInput: {
    fontFamily: Typography.fontFamily.regular,
    minHeight: 80,
    padding: 0,
    margin: 0,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
  },
  submitButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Borders.radius.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#FFFFFF",
  },
});
