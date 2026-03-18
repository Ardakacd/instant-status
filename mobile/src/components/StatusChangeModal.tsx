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
  onConfirm: (optionId: string, note?: string, expiresAt?: Date) => void;
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
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState(new Date());
  const [androidPickerMode, setAndroidPickerMode] = useState<"date" | "time">(
    "date",
  );
  const insets = useSafeAreaInsets();
  const { fs } = useResponsive();

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

  const isEndOfDay = (date: Date): boolean => {
    const endOfDayDate = getPresetDate("endOfDay");
    return (
      date.getDate() === endOfDayDate.getDate() &&
      date.getMonth() === endOfDayDate.getMonth() &&
      date.getFullYear() === endOfDayDate.getFullYear() &&
      date.getHours() === 23 &&
      date.getMinutes() === 59
    );
  };

  const handlePresetSelect = (preset: string) => {
    setExpiresAt(getPresetDate(preset));
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
    }
  };

  const handleConfirm = () => {
    // Haptics for status change (medium strength for action)
    hapticAction();

    // All statuses can have expiration times
    onConfirm(
      selectedOption.id,
      note.trim() || undefined,
      expiresAt || undefined,
    );
    // Reset form
    setNote("");
    setExpiresAt(null);
    setShowCustomPicker(false);
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
    setShowCustomPicker(false);
    setAndroidPickerMode("date"); // Reset Android picker mode
    onClose();
  };

  const handleClearExpiresAt = () => {
    setExpiresAt(null);
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
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={Colors.text.secondary}
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
                      <Text variant="primary" style={[styles.sectionLabel, { fontSize: fs(16) }]}>
                        Note (Optional)
                      </Text>
                      <TextInput
                        style={styles.noteInput}
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
                      <Text variant="primary" style={[styles.sectionLabel, { fontSize: fs(16) }]}>
                        Until When (Optional)
                      </Text>
                      <Text variant="hint" style={styles.sectionHint}>
                        After this time your status will be changed to available
                      </Text>

                      {/* Presets */}
                      <View style={styles.presetsContainer}>
                        <TouchableOpacity
                          style={[
                            styles.presetButton,
                            expiresAt &&
                              Math.abs(
                                expiresAt.getTime() -
                                  getPresetDate("30min").getTime(),
                              ) < 60000 &&
                              styles.presetButtonActive,
                          ]}
                          onPress={() => handlePresetSelect("30min")}
                          activeOpacity={0.7}
                        >
                          <Text
                            variant="primary"
                            style={[
                              styles.presetButtonText,
                              expiresAt &&
                                Math.abs(
                                  expiresAt.getTime() -
                                    getPresetDate("30min").getTime(),
                                ) < 60000 &&
                                styles.presetButtonTextActive,
                            ]}
                          >
                            30 min
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.presetButton,
                            expiresAt &&
                              Math.abs(
                                expiresAt.getTime() -
                                  getPresetDate("1hour").getTime(),
                              ) < 60000 &&
                              styles.presetButtonActive,
                          ]}
                          onPress={() => handlePresetSelect("1hour")}
                          activeOpacity={0.7}
                        >
                          <Text
                            variant="primary"
                            style={[
                              styles.presetButtonText,
                              expiresAt &&
                                Math.abs(
                                  expiresAt.getTime() -
                                    getPresetDate("1hour").getTime(),
                                ) < 60000 &&
                                styles.presetButtonTextActive,
                            ]}
                          >
                            1 hour
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.presetButton,
                            expiresAt &&
                              Math.abs(
                                expiresAt.getTime() -
                                  getPresetDate("2hours").getTime(),
                              ) < 60000 &&
                              styles.presetButtonActive,
                          ]}
                          onPress={() => handlePresetSelect("2hours")}
                          activeOpacity={0.7}
                        >
                          <Text
                            variant="primary"
                            style={[
                              styles.presetButtonText,
                              expiresAt &&
                                Math.abs(
                                  expiresAt.getTime() -
                                    getPresetDate("2hours").getTime(),
                                ) < 60000 &&
                                styles.presetButtonTextActive,
                            ]}
                          >
                            2 hours
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.presetButton,
                            expiresAt &&
                              isEndOfDay(expiresAt) &&
                              styles.presetButtonActive,
                          ]}
                          onPress={() => handlePresetSelect("endOfDay")}
                          activeOpacity={0.7}
                        >
                          <Text
                            variant="primary"
                            style={[
                              styles.presetButtonText,
                              expiresAt &&
                                isEndOfDay(expiresAt) &&
                                styles.presetButtonTextActive,
                            ]}
                          >
                            Until Tonight
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Custom Date/Time Picker */}
                      {!showCustomPicker && (
                        <TouchableOpacity
                          style={styles.customPickerButton}
                          onPress={() => {
                            setShowCustomPicker(true);
                            setAndroidPickerMode("date"); // Reset to date mode
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={20}
                            color={Colors.interaction.primary}
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
                        <View style={styles.selectedDateTimeContainer}>
                          <View style={styles.selectedDateTimeContent}>
                            <View style={styles.selectedDateTimeTextContainer}>
                              <Text
                                variant="hint"
                                style={styles.selectedDateTimeLabel}
                              >
                                Selected:
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
                            >
                              <Ionicons
                                name="close-circle"
                                size={20}
                                color={Colors.text.secondary}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {showCustomPicker && Platform.OS === "ios" && (
                        <View style={styles.iosPickerContainer}>
                          <View style={styles.iosPickerHeader}>
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
    backgroundColor: "rgba(0, 0, 0, 0.8)", // Darker backdrop for focus
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: Colors.canvas.background,
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    maxHeight: "90%",
    paddingBottom: 40,
    // Physical shadow for Neobrutalist depth
    shadowColor: Colors.text.primary,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 10, // Necessary for Samsung A15
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
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    fontSize: 12,
    marginBottom: Spacing.md,
  },
  noteInput: {
    backgroundColor: Colors.canvas.background,
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 100,
    borderWidth: Borders.width,
    borderColor: Colors.text.primary,
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
    backgroundColor: Colors.canvas.background,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary,
  },
  presetButtonActive: {
    backgroundColor: Colors.interaction.primary, // Mint background
    borderColor: Colors.text.primary,
    // Subtle physical shift when active
    transform: [{ translateY: 2 }],
  },
  presetButtonText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
  },
  presetButtonTextActive: {
    color: Colors.text.primary, // Charcoal text on Mint
  },
  customPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Borders.radius.medium,
    backgroundColor: "#F9FAFB",
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
    backgroundColor: "#ECFDF5",
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
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
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
    backgroundColor: "#ECFDF5",
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
    color: Colors.text.primary, // Charcoal text for contrast on colored backgrounds
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  iosPickerContainer: {
    marginTop: Spacing.md,
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    overflow: "hidden",
  },
  iosPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    backgroundColor: "#F9FAFB",
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
    backgroundColor: Colors.canvas.background,
  },
});
