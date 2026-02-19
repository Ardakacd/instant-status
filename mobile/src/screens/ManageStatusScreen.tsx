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
import { ErrorBanner } from "../components/ErrorBanner";
import { EmojiPicker } from "../components/EmojiPicker";
import { ColorPicker } from "../components/ColorPicker";
import StatusPreviewCard from "../components/StatusPreviewCard";
import { useIsPremium } from "../hooks/useIsPremium";
import { PurchasesService } from "../services/purchases.service";
import { Colors, Borders, Spacing, Typography } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";
import { TextInput } from "../components/inputs/TextInput";

const MAX_CUSTOM_OPTIONS = 4;

export default function ManageStatusScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
      setGlobalError(
        error.message || "Failed to load status options. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setLabel("");
    setEmoji("😎");
    setColor("#3B82F6");
    setSelectedOption(null);
    setSaving(false); // Reset saving state
    setCreateModalVisible(true);
  };

  const handleEdit = async (option: StatusOption) => {
    // If it's a custom status (user_id !== null) and user is not premium, show paywall
    if (option.user_id !== null && !isPremium) {
      const purchased = await PurchasesService.presentPaywall();
      if (!purchased) {
        return;
      }
      // If purchase successful, continue to edit modal
    }
    setLabel(option.label);
    setEmoji(option.emoji);
    setColor(option.color);
    setSelectedOption(option);
    setSaving(false); // Reset saving state
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
              setGlobalError(""); // Clear any previous errors
              await statusOptionService.deleteStatusOption(option.id);
              Toast.show({
                type: "success",
                text1: "Status option deleted",
              });
              setGlobalError("");
              loadStatusOptions();
            } catch (error: any) {
              setGlobalError(
                error.message ||
                  "Failed to delete status option. Please try again.",
              );
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
    if (customOptionsCount >= MAX_CUSTOM_OPTIONS) {
      Toast.show({
        type: "info",
        text1: `You can only create up to ${MAX_CUSTOM_OPTIONS} custom status options. Please delete one first.`,
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
      setGlobalError(
        error.message || "Failed to create status option. Please try again.",
      );
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
      setGlobalError(
        error.message || "Failed to update status option. Please try again.",
      );
      editModalScrollRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const systemOptions = statusOptions.filter((opt) => opt.user_id === null);
  const customOptions = statusOptions.filter((opt) => opt.user_id !== null);

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
            Manage Status
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.interaction.primary} />
        </View>
      </View>
    );
  }

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
          Manage Status
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
      >
        {/* Global Error Banner */}
        {globalError ? (
          <ErrorBanner
            message={globalError}
            onDismiss={() => setGlobalError("")}
          />
        ) : null}

        {/* Default Statuses */}
        <View style={styles.section}>
          <Text variant="primary" style={styles.sectionTitle}>
            Default Statuses
          </Text>
          <View style={styles.optionsGrid}>
            {systemOptions.map((option) => (
              <View key={option.id} style={styles.optionCard}>
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text variant="primary" style={styles.optionLabel}>
                  {option.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Custom Status Options */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              variant="primary"
              style={[styles.sectionTitle, styles.sectionTitleInline]}
            >
              Your Custom Statuses
            </Text>
            {customOptions.length < MAX_CUSTOM_OPTIONS && (
              <TouchableOpacity style={styles.addButton} onPress={handleCreate}>
                <Ionicons
                  name="add"
                  size={20}
                  color={Colors.interaction.primary}
                />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {customOptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text variant="secondary" style={styles.emptyStateText}>
                No custom status options yet
              </Text>
              <Button variant="primary" onPress={handleCreate}>
                Create Your First
              </Button>
            </View>
          ) : (
            <View style={styles.optionsGrid}>
              {customOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.optionCard}
                  onPress={() => handleEdit(option)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionEmoji}>{option.emoji}</Text>
                  <Text variant="primary" style={styles.optionLabel}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
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
                  color={Colors.text.secondary}
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
                  <Text variant="secondary" style={styles.errorText}>
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
                  <Text variant="secondary" style={styles.errorText}>
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
                  setLabelError("");
                  setEmojiError("");
                }}
                style={styles.modalFooterButton}
              >
                Cancel
              </Button>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
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
          setLabelError("");
          setEmojiError("");
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text variant="primary" style={styles.modalTitle}>
                Edit Custom Status
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditModalVisible(false);
                  setLabelError("");
                  setEmojiError("");
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={Colors.text.secondary}
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
                  <Text variant="secondary" style={styles.errorText}>
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
                  <Text variant="secondary" style={styles.errorText}>
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
                style={styles.deleteButton}
                onPress={() => {
                  if (selectedOption) {
                    setEditModalVisible(false);
                    handleDelete(selectedOption);
                  }
                }}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
              <Button
                variant="secondary"
                onPress={() => {
                  setEditModalVisible(false);
                  setSaving(false);
                }}
                style={styles.modalFooterButton}
              >
                Cancel
              </Button>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
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
    backgroundColor: Colors.canvas.background,
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
    padding: Spacing.lg,
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
    marginBottom: Spacing.md,
  },
  sectionTitleInline: {
    marginBottom: 0,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.interaction.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Borders.radius.medium,
    gap: Spacing.xs,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.interaction.primary,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  optionCard: {
    width: "47%",
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
    padding: Spacing.md,
    alignItems: "center",
  },
  optionEmoji: {
    fontSize: 26,
    lineHeight: 30,
    includeFontPadding: false,
    marginBottom: Spacing.sm,
  },
  optionLabel: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
  },
  emptyStateText: {
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.canvas.background,
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
    color: Colors.interaction.error,
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
    backgroundColor: Colors.interaction.error + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.interaction.error,
  },
  saveButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Borders.radius.medium,
    backgroundColor: Colors.interaction.primary,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
  },
});
