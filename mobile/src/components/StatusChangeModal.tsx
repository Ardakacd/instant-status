import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { StatusState } from "../types";

interface StatusChangeModalProps {
  visible: boolean;
  selectedStatus: StatusState;
  onClose: () => void;
  onConfirm: (status: StatusState, note?: string, expiresAt?: Date) => void;
  loading?: boolean;
}

const STATUS_COLORS_MAP: Record<StatusState, string> = {
  [StatusState.AVAILABLE]: "#10B981", // Green
  [StatusState.BUSY]: "#F59E0B", // Orange
  [StatusState.DND]: "#EF4444", // Red
  [StatusState.FOCUS]: "#6366F1", // Indigo
  [StatusState.SOCIAL]: "#EC4899", // Pink
  [StatusState.COMMUTE]: "#3B82F6", // Blue
};

const STATUS_LABELS_MAP: Record<StatusState, string> = {
  [StatusState.AVAILABLE]: "Available",
  [StatusState.BUSY]: "Busy",
  [StatusState.DND]: "Do Not Disturb",
  [StatusState.FOCUS]: "Focus",
  [StatusState.SOCIAL]: "Social",
  [StatusState.COMMUTE]: "Commute",
};

const STATUS_ICONS_MAP: Record<StatusState, string> = {
  [StatusState.AVAILABLE]: "✓",
  [StatusState.BUSY]: "!",
  [StatusState.DND]: "🚫",
  [StatusState.FOCUS]: "🎯",
  [StatusState.SOCIAL]: "👥",
  [StatusState.COMMUTE]: "🚗",
};

export default function StatusChangeModal({
  visible,
  selectedStatus,
  onClose,
  onConfirm,
  loading = false,
}: StatusChangeModalProps) {
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState(new Date());
  const [androidPickerMode, setAndroidPickerMode] = useState<"date" | "time">(
    "date"
  );

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
    // All statuses can have expiration times
    onConfirm(selectedStatus, note.trim() || undefined, expiresAt || undefined);
    // Reset form
    setNote("");
    setExpiresAt(null);
    setShowCustomPicker(false);
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

  const statusColor = STATUS_COLORS_MAP[selectedStatus];
  const statusLabel = STATUS_LABELS_MAP[selectedStatus];
  const statusIcon = STATUS_ICONS_MAP[selectedStatus];

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
                ]}
              >
                {/* Header */}
                <View style={styles.header}>
                  <View style={styles.headerContent}>
                    <View
                      style={[
                        styles.statusIndicator,
                        { backgroundColor: statusColor + "20" },
                      ]}
                    >
                      <Text style={styles.statusIcon}>{statusIcon}</Text>
                    </View>
                    <View style={styles.headerText}>
                      <Text style={styles.headerTitle}>Change Status</Text>
                      <Text style={styles.headerSubtitle}>
                        Set your status to {statusLabel}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.scrollContent}
                  contentContainerStyle={styles.content}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Note Input */}
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Note (Optional)</Text>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="Add a note..."
                      placeholderTextColor="#9CA3AF"
                      value={note}
                      onChangeText={setNote}
                      multiline
                      maxLength={200}
                      textAlignVertical="top"
                      blurOnSubmit={true}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <Text style={styles.charCount}>{note.length}/200</Text>
                  </View>

                  {/* Until When Section - All statuses can have expiration times */}
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>
                      Until When (Optional)
                    </Text>
                    <Text style={styles.sectionHint}>
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
                                getPresetDate("30min").getTime()
                            ) < 60000 &&
                            styles.presetButtonActive,
                        ]}
                        onPress={() => handlePresetSelect("30min")}
                      >
                        <Text
                          style={[
                            styles.presetButtonText,
                            expiresAt &&
                              Math.abs(
                                expiresAt.getTime() -
                                  getPresetDate("30min").getTime()
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
                                getPresetDate("1hour").getTime()
                            ) < 60000 &&
                            styles.presetButtonActive,
                        ]}
                        onPress={() => handlePresetSelect("1hour")}
                      >
                        <Text
                          style={[
                            styles.presetButtonText,
                            expiresAt &&
                              Math.abs(
                                expiresAt.getTime() -
                                  getPresetDate("1hour").getTime()
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
                                getPresetDate("2hours").getTime()
                            ) < 60000 &&
                            styles.presetButtonActive,
                        ]}
                        onPress={() => handlePresetSelect("2hours")}
                      >
                        <Text
                          style={[
                            styles.presetButtonText,
                            expiresAt &&
                              Math.abs(
                                expiresAt.getTime() -
                                  getPresetDate("2hours").getTime()
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
                      >
                        <Text
                          style={[
                            styles.presetButtonText,
                            expiresAt &&
                              isEndOfDay(expiresAt) &&
                              styles.presetButtonTextActive,
                          ]}
                        >
                          Until end of day
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
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color="#007AFF"
                        />
                        <Text style={styles.customPickerText}>
                          Pick custom date & time
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Display selected datetime */}
                    {expiresAt && !showCustomPicker && (
                      <View style={styles.selectedDateTimeContainer}>
                        <View style={styles.selectedDateTimeContent}>
                          <View style={styles.selectedDateTimeTextContainer}>
                            <Text style={styles.selectedDateTimeLabel}>
                              Selected:
                            </Text>
                            <Text style={styles.selectedDateTimeText}>
                              {expiresAt.toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={handleClearExpiresAt}
                            style={styles.clearButton}
                          >
                            <Ionicons
                              name="close-circle"
                              size={20}
                              color="#EF4444"
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
                          >
                            <Text style={styles.iosPickerCancelText}>
                              Cancel
                            </Text>
                          </TouchableOpacity>
                          <Text style={styles.iosPickerTitle}>
                            Select Date & Time
                          </Text>
                          <TouchableOpacity
                            onPress={() => setShowCustomPicker(false)}
                            style={styles.iosPickerDoneButton}
                          >
                            <Text style={styles.iosPickerDoneText}>Done</Text>
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
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={[
                      styles.cancelButton,
                      loading && styles.buttonDisabled,
                    ]}
                    onPress={handleClose}
                    disabled={loading}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      { backgroundColor: statusColor },
                      loading && styles.buttonDisabled,
                    ]}
                    onPress={handleConfirm}
                    disabled={loading}
                  >
                    <Text style={styles.confirmButtonText}>Change Status</Text>
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: 40,
  },
  modalContainerExpanded: {
    maxHeight: "95%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
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
    marginRight: 12,
  },
  statusIcon: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6B7280",
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: 20,
    flexGrow: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 12,
  },
  noteInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#111827",
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  charCount: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "right",
    marginTop: 4,
  },
  presetsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  presetButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "transparent",
  },
  presetButtonActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#007AFF",
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  presetButtonTextActive: {
    color: "#007AFF",
  },
  customPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 8,
  },
  customPickerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    marginLeft: 8,
  },
  selectedDateTimeContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#F0F9FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BAE6FD",
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
    fontWeight: "500",
    color: "#0369A1",
    marginBottom: 4,
  },
  selectedDateTimeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0C4A6E",
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  selectedExpiresContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  selectedExpiresText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#10B981",
    marginLeft: 8,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  iosPickerContainer: {
    marginTop: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  iosPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  iosPickerCancelButton: {
    padding: 4,
  },
  iosPickerCancelText: {
    fontSize: 16,
    color: "#6B7280",
  },
  iosPickerDoneButton: {
    padding: 4,
  },
  iosPickerDoneText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  iosPicker: {
    height: 200,
    backgroundColor: "#FFFFFF",
  },
});
