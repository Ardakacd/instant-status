import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  statusOptionService,
  StatusOption,
} from "../services/status-option.service";
import Toast from "react-native-toast-message";
import Sentry from "../../sentry";
import { ErrorBanner } from "../components/ErrorBanner";
import { EmojiPicker } from "../components/EmojiPicker";
import { ColorPicker } from "../components/ColorPicker";
import StatusPreviewCard from "../components/StatusPreviewCard";
import { useIsPremium } from "../hooks/useIsPremium";
import { presentPaywall } from "../services/purchases.service";
import { Colors, Borders, Spacing, Typography, SAFE_AREA_BOTTOM, useResponsive, useColors } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";
import { TextInput } from "../components/inputs/TextInput";
import { MAX_CUSTOM_STATUS_OPTIONS } from "../constants/statusOptions";

export default function ManageStatusScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, horizontalPadding, fs } = useResponsive();
  const colors = useColors();
  const { isPremium } = useIsPremium();
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedOption, setSelectedOption] = useState<StatusOption | null>(
    null,
  );

  // Form state
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("😎");
  const [color, setColor] = useState("#3B82F6");
  const [saving, setSaving] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [emojiError, setEmojiError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const createModalScrollRef = useRef<ScrollView>(null);
  const editModalScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadStatusOptions();
  }, []);

  const loadStatusOptions = async () => {
    try {
      setLoading(true);
      setGlobalError(""); // Clear any previous errors
      const options = await statusOptionService.getStatusOptions();
      setStatusOptions(options);
    } catch (error: any) {
      Sentry.captureException(error);
      setGlobalError(error.message || "Failed to load status options. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!isPremium) {
      try {
        const purchased = await presentPaywall();
        if (!purchased) {
          return;
        }
      } catch (error: any) {
        Toast.show({
          type: "error",
          text1: error.message || "Failed to open subscription options. Please try again.",
        });
        return;
      }
    }
    setLabel("");
    setEmoji("😎");
    setColor("#3B82F6");
    setSelectedOption(null);
    setSaving(false);
    setGlobalError("");
    setLabelError("");
    setEmojiError("");
    setCreateModalVisible(true);
  };

  const handleEdit = async (option: StatusOption) => {
    // If it's a custom status (user_id !== null) and user is not premium, show paywall
    if (option.user_id !== null && !isPremium) {
      try {
        const purchased = await presentPaywall();
        if (!purchased) {
          return;
        }
      } catch (error: any) {
        Toast.show({
          type: "error",
          text1: error.message || "Failed to open subscription options. Please try again.",
        });
        return;
      }
    }
    setLabel(option.label);
    setEmoji(option.emoji);
    setColor(option.color);
    setSelectedOption(option);
    setSaving(false);
    setGlobalError("");
    setLabelError("");
    setEmojiError("");
    setEditModalVisible(true);
  };

  const handleDelete = (option: StatusOption) => {
    if (option.user_id === null) {
      Toast.show({
        type: "info",
        text1: "System status options cannot be deleted.",
      });
      return;
    }

    Alert.alert(
      "Delete Status Option",
      `Are you sure you want to delete "${option.label}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setGlobalError("");
              await statusOptionService.deleteStatusOption(option.id);
              setEditModalVisible(false);
              Toast.show({
                type: "success",
                text1: "Status option deleted",
              });
              loadStatusOptions();
            } catch (error: any) {
              Sentry.captureException(error);
              setGlobalError(error.message || "Failed to delete status option. Please try again.");
            }
          },
        },
      ],
    );
  };

  const handleLabelChange = (text: string) => {
    setLabel(text);
    if (labelError) setLabelError(""); // Clear error when user starts typing
  };

  const handleEmojiSelect = (selectedEmoji: string) => {
    setEmoji(selectedEmoji);
    if (emojiError) setEmojiError(""); // Clear error when user selects emoji
  };

  const validateForm = (): boolean => {
    let isValid = true;

    if (!label.trim()) {
      setLabelError("Label is required");
      isValid = false;
    }

    if (!emoji.trim()) {
      setEmojiError("Emoji is required");
      isValid = false;
    }

    return isValid;
  };

  const handleSaveCreate = async () => {
    // Prevent duplicate calls
    if (saving) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    // Check if user has reached the limit
    const customOptionsCount = statusOptions.filter(
      (opt) => opt.user_id !== null,
    ).length;
    if (customOptionsCount >= MAX_CUSTOM_STATUS_OPTIONS) {
      Toast.show({
        type: "info",
        text1: `You can only create up to ${MAX_CUSTOM_STATUS_OPTIONS} custom status options. Please delete one first.`,
      });
      return;
    }

    try {
      setSaving(true);
      setGlobalError(""); // Clear any previous errors
      await statusOptionService.createStatusOption({
        label: label.trim(),
        emoji: emoji.trim(),
        color: color.toUpperCase(),
      });
      setCreateModalVisible(false);
      setLabelError("");
      setEmojiError("");
      setGlobalError("");
      loadStatusOptions();
    } catch (error: any) {
      Sentry.captureException(error);
      setGlobalError(error.message || "Failed to create status option. Please try again.");
      createModalScrollRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    // Prevent duplicate calls
    if (saving) {
      return;
    }

    if (!selectedOption) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      setGlobalError(""); // Clear any previous errors
      await statusOptionService.updateStatusOption(selectedOption.id, {
        label: label.trim(),
        emoji: emoji.trim(),
        color: color.toUpperCase(),
      });
      Toast.show({
        type: "success",
        text1: "Status option updated",
      });
      setEditModalVisible(false);
      setLabelError("");
      setEmojiError("");
      setGlobalError("");
      loadStatusOptions();
    } catch (error: any) {
      Sentry.captureException(error);
      setGlobalError(error.message || "Failed to update status option. Please try again.");
      editModalScrollRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const customOptions = statusOptions.filter((opt) => opt.user_id !== null);

  const MIN_CARD_WIDTH = 140;
  const availableWidth = screenWidth - horizontalPadding * 2;
  const columns = Math.min(2, Math.max(1, Math.floor((availableWidth + Spacing.md) / (MIN_CARD_WIDTH + Spacing.md))));
  const cardWidth = (availableWidth - Spacing.md * (columns - 1)) / columns;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.canvas.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text variant="primary" style={styles.headerTitle}>
            Manage Status
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.interaction.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.canvas.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text variant="primary" style={styles.headerTitle}>
          Manage Status
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
        keyboardShouldPersistTaps="always"
      >
        {/* Global Error Banner */}
        {globalError ? (
          <ErrorBanner
            message={globalError}
            onDismiss={() => setGlobalError("")}
          />
        ) : null}

        {/* Custom Status Options */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="primary" style={[styles.sectionTitle, { fontSize: fs(18) }]}>
              Custom Statuses
            </Text>
            <Text variant="secondary" style={styles.usageText}>
              {customOptions.length} / {MAX_CUSTOM_STATUS_OPTIONS}
            </Text>
          </View>
          <View style={styles.optionsGrid}>
            {customOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.optionCard, { backgroundColor: colors.canvas.card, width: cardWidth }]}
                onPress={() => handleEdit(option)}
                activeOpacity={0.7}
              >
                <View style={[styles.optionColorBar, { backgroundColor: option.color }]} />
                <Text style={[styles.optionEmoji, { fontSize: fs(28), lineHeight: fs(34) }]}>
                  {option.emoji}
                </Text>
                <Text variant="primary" style={styles.optionLabel} numberOfLines={2}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
            {customOptions.length < MAX_CUSTOM_STATUS_OPTIONS && (
              <TouchableOpacity
                style={[styles.addCard, { borderColor: colors.text.secondary + "30", width: cardWidth }]}
                onPress={handleCreate}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={28} color={colors.text.secondary} />
                <Text variant="secondary" style={styles.addCardText}>Add new</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Create Modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setCreateModalVisible(false);
          setSaving(false);
          setGlobalError("");
          setLabelError("");
          setEmojiError("");
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { paddingBottom: Spacing.md + insets.bottom, backgroundColor: colors.canvas.background },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text variant="primary" style={styles.modalTitle}>
                Create Custom Status
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setCreateModalVisible(false);
                  setSaving(false);
                  setGlobalError("");
                  setLabelError("");
                  setEmojiError("");
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={createModalScrollRef}
              style={styles.modalBody}
              keyboardShouldPersistTaps="always"
            >
              {/* Global Error Banner */}
              {globalError ? (
                <ErrorBanner
                  message={globalError}
                  onDismiss={() => setGlobalError("")}
                />
              ) : null}

              {/* Preview Card */}
              <StatusPreviewCard emoji={emoji} label={label} color={color} />

              <View style={styles.formGroup}>
                <Text variant="secondary" style={styles.label}>
                  Label
                </Text>
                <TextInput
                  value={label}
                  onChangeText={handleLabelChange}
                  placeholder="e.g., In the gym"
                  maxLength={25}
                  error={!!labelError}
                />
                {labelError ? (
                  <Text variant="secondary" style={[styles.errorText, { color: colors.interaction.error }]}>
                    {labelError}
                  </Text>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <Text variant="secondary" style={styles.label}>
                  Emoji
                </Text>
                <EmojiPicker
                  selectedEmoji={emoji}
                  onSelect={handleEmojiSelect}
                />
                {emojiError ? (
                  <Text variant="secondary" style={[styles.errorText, { color: colors.interaction.error }]}>
                    {emojiError}
                  </Text>
                ) : null}
              </View>

              <View style={[styles.formGroup, styles.formGroupColor]}>
                <Text variant="secondary" style={styles.label}>
                  Color
                </Text>
                <ColorPicker selectedColor={color} onSelect={setColor} />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                variant="secondary"
                onPress={() => {
                  setCreateModalVisible(false);
                  setSaving(false);
                  setGlobalError("");
                  setLabelError("");
                  setEmojiError("");
                }}
                style={styles.modalFooterButton}
              >
                Cancel
              </Button>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: colors.interaction.primary }, saving && styles.saveButtonDisabled]}
                onPress={handleSaveCreate}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setEditModalVisible(false);
          setSaving(false);
          setGlobalError("");
          setLabelError("");
          setEmojiError("");
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { paddingBottom: SAFE_AREA_BOTTOM + insets.bottom, backgroundColor: colors.canvas.background },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text variant="primary" style={styles.modalTitle}>
                Edit Custom Status
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditModalVisible(false);
                  setSaving(false);
                  setGlobalError("");
                  setLabelError("");
                  setEmojiError("");
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={editModalScrollRef}
              style={styles.modalBody}
              keyboardShouldPersistTaps="always"
            >
              {/* Global Error Banner */}
              {globalError ? (
                <ErrorBanner
                  message={globalError}
                  onDismiss={() => setGlobalError("")}
                />
              ) : null}

              {/* Preview Card */}
              <StatusPreviewCard emoji={emoji} label={label} color={color} />

              <View style={styles.formGroup}>
                <Text variant="secondary" style={styles.label}>
                  Label
                </Text>
                <TextInput
                  value={label}
                  onChangeText={handleLabelChange}
                  placeholder="e.g., In the gym"
                  maxLength={25}
                  error={!!labelError}
                />
                {labelError ? (
                  <Text variant="secondary" style={[styles.errorText, { color: colors.interaction.error }]}>
                    {labelError}
                  </Text>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <Text variant="secondary" style={styles.label}>
                  Emoji
                </Text>
                <EmojiPicker
                  selectedEmoji={emoji}
                  onSelect={handleEmojiSelect}
                />
                {emojiError ? (
                  <Text variant="secondary" style={[styles.errorText, { color: colors.interaction.error }]}>
                    {emojiError}
                  </Text>
                ) : null}
              </View>

              <View style={[styles.formGroup, styles.formGroupColor]}>
                <Text variant="secondary" style={styles.label}>
                  Color
                </Text>
                <ColorPicker selectedColor={color} onSelect={setColor} />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: colors.interaction.error + "15" }]}
                onPress={() => {
                  if (selectedOption) {
                    handleDelete(selectedOption);
                  }
                }}
              >
                <Text style={[styles.deleteButtonText, { color: colors.interaction.error }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: colors.interaction.primary }, saving && styles.saveButtonDisabled]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
  },
  usageText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  optionCard: {
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    alignItems: "center",
    overflow: "hidden",
  },
  optionColorBar: {
    width: 32,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  optionEmoji: {
    fontSize: 28,
    lineHeight: 34,
    includeFontPadding: false,
    marginBottom: Spacing.xs,
  },
  optionLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
  },
  addCard: {
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    minHeight: 110,
  },
  addCardText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    marginTop: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: Borders.radius.large,
    borderTopRightRadius: Borders.radius.large,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.semiBold,
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formGroupColor: {
    marginTop: -Spacing.sm,
  },
  label: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing.xs,
  },
  errorText: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  modalFooter: {
    flexDirection: "row",
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: "center",
  },
  modalFooterButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Borders.radius.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
  },
  saveButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Borders.radius.medium,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#FFFFFF",
  },
});
