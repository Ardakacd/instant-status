import React, { useState, useEffect } from "react";
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { StatusOption } from "../types";
import {
  Colors,
  Borders,
  Spacing,
  Typography,
  getContrastingTextColor,
  SAFE_AREA_BOTTOM,
  useResponsive,
  useColors,
} from "../design";
import { Text } from "./primitives/Text";
import { TextInput } from "./inputs/TextInput";
import { Section } from "./containers/Section";
import { Button } from "./actions/Button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hapticAction } from "../utils/haptics";

interface StatusChangeModalProps {
  visible: boolean;
  selectedOption: StatusOption;
  onClose: () => void;
  onConfirm: (optionId: string, note?: string, expiresAt?: Date) => Promise<void>;
  loading?: boolean;
}

export default function StatusChangeModal({
  visible,
  selectedOption,
  onClose,
  onConfirm,
  loading = false,
}: StatusChangeModalProps) {
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<"30min" | "1hour" | "2hours" | "tonight" | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState(new Date());
  const [androidPickerMode, setAndroidPickerMode] = useState<"date" | "time">(
    "date",
  );
  const insets = useSafeAreaInsets();
  const { fs } = useResponsive();
  const colors = useColors();

  // Note: All statuses can have expiration times

  const getPresetDate = (preset: string): Date => {
    const now = new Date();
    switch (preset) {
      case "30min":
        return new Date(now.getTime() + 30 * 60 * 1000);
      case "1hour":
        return new Date(now.getTime() + 60 * 60 * 1000);
      case "2hours":
        return new Date(now.getTime() + 2 * 60 * 60 * 1000);
      case "endOfDay":
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999); // End of today
        return endOfDay;
      default:
        return now;
    }
  };

  const handlePresetSelect = (preset: string) => {
    setExpiresAt(getPresetDate(preset));
    setSelectedPreset(preset === "endOfDay" ? "tonight" : preset as "30min" | "1hour" | "2hours");
    setShowCustomPicker(false);
    setAndroidPickerMode("date"); // Reset Android picker mode
  };

  const handleCustomDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      // On Android, use two-step approach: date first, then time
      if (event.type === "dismissed") {
        setShowCustomPicker(false);
        setAndroidPickerMode("date"); // Reset to date mode
        return;
      }
      if (event.type === "set" && selectedDate) {
        if (androidPickerMode === "date") {
          // Date selected, now show time picker
          setCustomDate(selectedDate);
          setAndroidPickerMode("time");
        } else {
          // Time selected, combine with date and finish
          const combinedDate = new Date(customDate);
          combinedDate.setHours(selectedDate.getHours());
          combinedDate.setMinutes(selectedDate.getMinutes());
          setCustomDate(combinedDate);
          setExpiresAt(combinedDate);
          setSelectedPreset(null); // Custom date/time — deselect preset chip
          setShowCustomPicker(false);
          setAndroidPickerMode("date"); // Reset for next time
        }
      }
      return;
    }
    // iOS behavior (picker stays open)
    if (selectedDate) {
      setCustomDate(selectedDate);
      setExpiresAt(selectedDate);
      setSelectedPreset(null); // Custom date/time — deselect preset chip
    }
  };

  const handleConfirm = async () => {
    hapticAction();
    try {
      await onConfirm(
        selectedOption.id,
        note.trim() || undefined,
        expiresAt || undefined,
      );
      // Reset form only on success so note/expiry survive an API error
      setNote("");
      setExpiresAt(null);
      setSelectedPreset(null);
      setShowCustomPicker(false);
    } catch {
      // Error is handled by the caller — do not reset form state
    }
  };

  const formatDateTimeDisplay = (date: Date): string => {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleClose = () => {
    setNote("");
    setExpiresAt(null);
    setSelectedPreset(null);
    setShowCustomPicker(false);
    setAndroidPickerMode("date"); // Reset Android picker mode
    onClose();
  };

  const handleClearExpiresAt = () => {
    setExpiresAt(null);
    setSelectedPreset(null);
    setCustomDate(new Date()); // Reset to current date
  };

  const statusColor = selectedOption.color;
  const statusLabel = selectedOption.label;
  const statusIcon = selectedOption.emoji;

  return (
    <>
      {/* Render Android DateTimePicker outside Modal to avoid modal conflicts */}
      {showCustomPicker && Platform.OS === "android" && (
        <DateTimePicker
          value={customDate}
          mode={androidPickerMode}
          is24Hour={false}
          display="default"
          onChange={handleCustomDateChange}
          minimumDate={androidPickerMode === "date" ? new Date() : undefined}
        />
      )}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={[
                  styles.modalContainer,
                  { backgroundColor: colors.canvas.background },
                  expiresAt && styles.modalContainerExpanded,
                  { paddingBottom: SAFE_AREA_BOTTOM + insets.bottom },
                ]}
              >
                {/* Header */}
                <View style={styles.header}>
                  <View style={styles.headerContent}>
                    <View
                      style={[
                        styles.statusIndicator,
                        { backgroundColor: statusColor + "20", width: fs(48), height: fs(48), borderRadius: fs(24) },
                      ]}
                    >
                      <Text style={[styles.statusIcon, { fontSize: fs(22), lineHeight: fs(26) }]}>{statusIcon}</Text>
                    </View>
                    <View style={styles.headerText}>
                      <Text variant="primary" style={[styles.headerTitle, { fontSize: fs(20) }]}>
                        Set Status
                      </Text>
                      <Text variant="secondary" style={styles.headerSubtitle}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                    accessibilityLabel="Cancel"
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
                  style={styles.scrollContent}
                  contentContainerStyle={styles.content}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                >
                  <Section spacing="lg">
                    {/* Note Input */}
                    <View>
                      <Text style={styles.sectionLabel}>NOTE</Text>
                      <TextInput
                        style={[styles.noteInput, { backgroundColor: colors.canvas.background, borderColor: colors.text.secondary + "40" }]}
                        placeholder="Add a note..."
                        value={note}
                        onChangeText={setNote}
                        multiline
                        maxLength={200}
                        textAlignVertical="top"
                        blurOnSubmit={true}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      <Text variant="hint" style={styles.charCount}>
                        {note.length}/200
                      </Text>
                    </View>

                    {/* Until When Section - All statuses can have expiration times */}
                    <View>
                      <Text style={styles.sectionLabel}>UNTIL WHEN</Text>
                      <Text variant="hint" style={styles.sectionHint}>
                        After this time your status will be changed to available
                      </Text>

                      {/* Presets */}
                      <View style={styles.presetsContainer}>
                        {[
                          { key: "30min", label: "30 min", isActive: selectedPreset === "30min" },
                          { key: "1hour", label: "1 hour", isActive: selectedPreset === "1hour" },
                          { key: "2hours", label: "2 hours", isActive: selectedPreset === "2hours" },
                          { key: "endOfDay", label: "Until Tonight", isActive: selectedPreset === "tonight" },
                        ].map(({ key, label, isActive }) => (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.presetButton,
                              { backgroundColor: isActive ? colors.interaction.primary : colors.canvas.card, borderColor: colors.text.secondary + "40" },
                              isActive && styles.presetButtonActive,
                            ]}
                            onPress={() => handlePresetSelect(key)}
                            activeOpacity={0.7}
                          >
                            <Text
                              variant="primary"
                              style={[
                                styles.presetButtonText,
                                isActive && styles.presetButtonTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Custom Date/Time Picker */}
                      {!showCustomPicker && (
                        <TouchableOpacity
                          style={[styles.customPickerButton, { backgroundColor: colors.canvas.card }]}
                          onPress={() => {
                            setShowCustomPicker(true);
                            setAndroidPickerMode("date"); // Reset to date mode
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={20}
                            color={colors.interaction.primary}
                          />
                          <Text
                            variant="primary"
                            style={styles.customPickerText}
                          >
                            Pick custom date & time
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Display selected datetime */}
                      {expiresAt && !showCustomPicker && (
                        <View style={[styles.selectedDateTimeContainer, { backgroundColor: colors.tint.mint }]}>
                          <View style={styles.selectedDateTimeContent}>
                            <View style={styles.selectedDateTimeTextContainer}>
                              <Text style={styles.selectedDateTimeLabel}>
                                SELECTED:
                              </Text>
                              <Text
                                variant="primary"
                                style={styles.selectedDateTimeText}
                              >
                                {formatDateTimeDisplay(expiresAt)}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={handleClearExpiresAt}
                              style={styles.clearButton}
                              activeOpacity={0.7}
                              accessibilityLabel="Clear expiration"
                              accessibilityRole="button"
                            >
                              <Ionicons
                                name="close-circle"
                                size={20}
                                color={colors.text.secondary}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {showCustomPicker && Platform.OS === "ios" && (
                        <View style={[styles.iosPickerContainer, { backgroundColor: colors.canvas.card }]}>
                          <View style={[styles.iosPickerHeader, { backgroundColor: colors.canvas.card }]}>
                            <TouchableOpacity
                              onPress={() => setShowCustomPicker(false)}
                              style={styles.iosPickerCancelButton}
                              activeOpacity={0.7}
                            >
                              <Text
                                variant="secondary"
                                style={styles.iosPickerCancelText}
                              >
                                Cancel
                              </Text>
                            </TouchableOpacity>
                            <Text
                              variant="primary"
                              style={styles.iosPickerTitle}
                            >
                              Select Date & Time
                            </Text>
                            <TouchableOpacity
                              onPress={() => setShowCustomPicker(false)}
                              style={styles.iosPickerDoneButton}
                              activeOpacity={0.7}
                            >
                              <Text
                                variant="primary"
                                style={styles.iosPickerDoneText}
                              >
                                Done
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <DateTimePicker
                            value={customDate}
                            mode="datetime"
                            is24Hour={false}
                            display="spinner"
                            onChange={(event, date) => {
                              if (date) {
                                setCustomDate(date);
                                setExpiresAt(date);
                              }
                            }}
                            minimumDate={new Date()}
                            style={styles.iosPicker}
                          />
                        </View>
                      )}
                    </View>
                  </Section>
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                  <Button
                    variant="secondary"
                    onPress={handleClose}
                    disabled={loading}
                    style={styles.cancelButton}
                  >
                    Cancel
                  </Button>
                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      { backgroundColor: statusColor },
                      loading && styles.buttonDisabled,
                    ]}
                    onPress={handleConfirm}
                    disabled={loading}
                    activeOpacity={0.9}
                  >
                    {loading ? (
                      <Text
                        variant="primary"
                        style={[
                          styles.confirmButtonText,
                          { color: getContrastingTextColor(statusColor), fontSize: fs(16) },
                        ]}
                      >
                        Setting...
                      </Text>
                    ) : (
                      <Text
                        variant="primary"
                        style={[
                          styles.confirmButtonText,
                          { color: getContrastingTextColor(statusColor), fontSize: fs(16) },
                        ]}
                      >
                        Set Status
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    maxHeight: "90%",
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
  },
  modalContainerExpanded: {
    maxHeight: "95%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  statusIcon: {
    fontSize: 22,
    lineHeight: 26,
    includeFontPadding: false,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    fontSize: 12,
    marginBottom: Spacing.md,
  },
  noteInput: {
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  presetsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  presetButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Borders.radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetButtonActive: {
    backgroundColor: Colors.interaction.primary,
    borderColor: "transparent",
  },
  presetButtonText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
  },
  presetButtonTextActive: {
    color: "#FFFFFF",
  },
  customPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Borders.radius.medium,
    marginTop: Spacing.sm,
  },
  customPickerText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.interaction.primary,
    marginLeft: Spacing.sm,
  },
  selectedDateTimeContainer: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Borders.radius.medium,
  },
  selectedDateTimeContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedDateTimeTextContainer: {
    flex: 1,
  },
  selectedDateTimeLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  selectedDateTimeText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
  },
  clearButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  selectedExpiresContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Borders.radius.medium,
  },
  selectedExpiresText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
  },
  confirmButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Borders.radius.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  iosPickerContainer: {
    marginTop: Spacing.md,
    borderRadius: Borders.radius.medium,
    overflow: "hidden",
  },
  iosPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  iosPickerTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  iosPickerCancelButton: {
    padding: Spacing.xs,
  },
  iosPickerCancelText: {
    fontSize: 16,
  },
  iosPickerDoneButton: {
    padding: Spacing.xs,
  },
  iosPickerDoneText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.interaction.primary,
  },
  iosPicker: {
    height: 200,
  },
});
