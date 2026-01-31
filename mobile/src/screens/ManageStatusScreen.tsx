import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
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
import EmojiPicker from "../components/EmojiPicker";
import ColorPicker from "../components/ColorPicker";
import StatusPreviewCard from "../components/StatusPreviewCard";

const MAX_CUSTOM_OPTIONS = 4;

export default function ManageStatusScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedOption, setSelectedOption] = useState<StatusOption | null>(
    null
  );

  // Form state
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("");
  const [color, setColor] = useState("#10B981");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStatusOptions();
  }, []);

  const loadStatusOptions = async () => {
    try {
      setLoading(true);
      const options = await statusOptionService.getStatusOptions();
      setStatusOptions(options);
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Failed to load status options",
        text2: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setLabel("");
    setEmoji("");
    setColor("#10B981");
    setSelectedOption(null);
    setSaving(false); // Reset saving state
    setCreateModalVisible(true);
  };

  const handleEdit = (option: StatusOption) => {
    setLabel(option.label);
    setEmoji(option.emoji);
    setColor(option.color);
    setSelectedOption(option);
    setSaving(false); // Reset saving state
    setEditModalVisible(true);
  };

  const handleDelete = (option: StatusOption) => {
    if (option.user_id === null) {
      Alert.alert("Cannot Delete", "System status options cannot be deleted.");
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
              await statusOptionService.deleteStatusOption(option.id);
              Toast.show({
                type: "success",
                text1: "Status option deleted",
              });
              loadStatusOptions();
            } catch (error: any) {
              Toast.show({
                type: "error",
                text1: "Failed to delete",
                text2: error.message,
              });
            }
          },
        },
      ]
    );
  };

  const handleSaveCreate = async () => {
    // Prevent duplicate calls
    if (saving) {
      return;
    }

    if (!label.trim() || !emoji.trim()) {
      Alert.alert("Validation Error", "Label and emoji are required.");
      return;
    }

    // Check if user has reached the limit
    const customOptionsCount = statusOptions.filter(
      (opt) => opt.user_id !== null
    ).length;
    if (customOptionsCount >= MAX_CUSTOM_OPTIONS) {
      Alert.alert(
        "Limit Reached",
        `You can only create up to ${MAX_CUSTOM_OPTIONS} custom status options. Please delete one first.`
      );
      return;
    }

    try {
      setSaving(true);
      await statusOptionService.createStatusOption({
        label: label.trim(),
        emoji: emoji.trim(),
        color: color.toUpperCase(),
      });
      setCreateModalVisible(false);
      loadStatusOptions();
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Failed to create",
        text2: error.message,
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

    if (!selectedOption || !label.trim() || !emoji.trim()) {
      Alert.alert("Validation Error", "Label and emoji are required.");
      return;
    }

    try {
      setSaving(true);
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
      loadStatusOptions();
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Failed to update",
        text2: error.message,
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
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Status</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
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
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Status</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Default Statuses */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Statuses</Text>
          <View style={styles.optionsGrid}>
            {systemOptions.map((option) => (
              <View key={option.id} style={styles.optionCard}>
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Custom Status Options */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Custom Statuses</Text>
            {customOptions.length < MAX_CUSTOM_OPTIONS && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleCreate}
              >
                <Ionicons name="add" size={20} color="#007AFF" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {customOptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No custom status options yet
              </Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreate}
              >
                <Text style={styles.createButtonText}>Create Your First</Text>
              </TouchableOpacity>
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
                  <Text style={styles.optionLabel}>{option.label}</Text>
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
              <Text style={styles.modalTitle}>Create Custom Status</Text>
              <TouchableOpacity
                onPress={() => {
                  setCreateModalVisible(false);
                  setSaving(false);
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Preview Card */}
              <StatusPreviewCard emoji={emoji} label={label} color={color} />

              <View style={styles.formGroup}>
                <Text style={styles.label}>Label</Text>
                <TextInput
                  style={styles.input}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="e.g., In a Meeting"
                  maxLength={25}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Emoji</Text>
                <EmojiPicker selectedEmoji={emoji} onSelect={setEmoji} />
                {emoji && (
                  <View style={styles.selectedEmojiContainer}>
                    <Text style={styles.selectedEmojiText}>
                      Selected: {emoji}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Color</Text>
                <ColorPicker selectedColor={color} onSelect={setColor} />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setCreateModalVisible(false);
                  setSaving(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
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
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Custom Status</Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Preview Card */}
              <StatusPreviewCard emoji={emoji} label={label} color={color} />

              <View style={styles.formGroup}>
                <Text style={styles.label}>Label</Text>
                <TextInput
                  style={styles.input}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="e.g., In a Meeting"
                  maxLength={25}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Emoji</Text>
                <EmojiPicker selectedEmoji={emoji} onSelect={setEmoji} />
                {emoji && (
                  <View style={styles.selectedEmojiContainer}>
                    <Text style={styles.selectedEmojiText}>
                      Selected: {emoji}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Color</Text>
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
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setEditModalVisible(false);
                  setSaving(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
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
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  optionCard: {
    width: "47%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    position: "relative",
  },
  optionEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyStateText: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 12,
    alignItems: "center",
  },
  deleteButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#DC2626",
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  selectedEmojiContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignItems: "center",
  },
  selectedEmojiText: {
    fontSize: 16,
    color: "#374151",
  },
});

