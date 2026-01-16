import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import {
  InstantStatusWidget,
  type FriendStatusWidgetItem,
} from "./InstantStatusWidget";

const WIDGET_DATA_KEY = "widget_status_data";
const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";

export function WidgetConfigurationScreen({
  widgetInfo,
  renderWidget,
  setResult,
}: WidgetConfigurationScreenProps) {
  const [friends, setFriends] = useState<FriendStatusWidgetItem[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);

  const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(widgetInfo.widgetId)}`;

  useEffect(() => {
    loadFriendsAndSelection();
  }, []);

  async function loadFriendsAndSelection() {
    try {
      // Load friends from storage
      const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
      if (data) {
        const parsedData: FriendStatusWidgetItem[] = JSON.parse(data);
        setFriends(parsedData);
      }

      // Load previously selected friends for this widget
      const savedSelection = await AsyncStorage.getItem(configKey);
      if (savedSelection) {
        const selectedIds: string[] = JSON.parse(savedSelection);
        setSelectedFriendIds(new Set(selectedIds));
      } else {
        // Default: select first 8 friends if no selection exists
        const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
        if (data) {
          const parsedData: FriendStatusWidgetItem[] = JSON.parse(data);
          setSelectedFriendIds(
            new Set(parsedData.slice(0, 8).map((f) => f.id))
          );
        }
      }
    } catch (error) {
      console.error("Error loading widget configuration:", error);
    } finally {
      setLoading(false);
    }
  }

  function toggleFriendSelection(friendId: string) {
    const newSelection = new Set(selectedFriendIds);
    if (newSelection.has(friendId)) {
      newSelection.delete(friendId);
    } else {
      newSelection.add(friendId);
    }
    setSelectedFriendIds(newSelection);
  }

  async function handleSave() {
    try {
      // Save selected friend IDs for this widget
      const selectedIds = Array.from(selectedFriendIds);
      await AsyncStorage.setItem(configKey, JSON.stringify(selectedIds));

      // Filter friends based on selection
      const selectedFriends = friends.filter((f) =>
        selectedFriendIds.has(f.id)
      );

      // Render widget preview with selected friends
      renderWidget(
        <InstantStatusWidget
          friends={selectedFriends}
          hasAnyFriends={friends.length > 0}
        />
      );

      // Mark configuration as complete
      setResult("ok");
    } catch (error) {
      console.error("Error saving widget configuration:", error);
      setResult("cancel");
    }
  }

  function handleCancel() {
    setResult("cancel");
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading friends...</Text>
        </View>
      </View>
    );
  }

  if (friends.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No friends available</Text>
          <Text style={styles.emptySubtitle}>
            Add some friends in the app first
          </Text>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Friends</Text>
        <Text style={styles.subtitle}>
          Choose which friends to show in the widget
        </Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {friends.map((friend) => {
          const isSelected = selectedFriendIds.has(friend.id);
          return (
            <TouchableOpacity
              key={friend.id}
              style={[
                styles.friendItem,
                isSelected && styles.friendItemSelected,
              ]}
              onPress={() => toggleFriendSelection(friend.id)}
            >
              <View style={styles.friendContent}>
                <View
                  style={[
                    styles.checkbox,
                    isSelected && styles.checkboxSelected,
                  ]}
                >
                  {isSelected && <View style={styles.checkboxInner} />}
                </View>
                <Text style={styles.friendName}>
                  {friend.firstName}
                  {friend.lastName ? ` ${friend.lastName}` : ""}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.saveButton,
            selectedFriendIds.size === 0 && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={selectedFriendIds.size === 0}
        >
          <Text style={styles.saveButtonText}>
            Save ({selectedFriendIds.size})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#8E8E93",
  },
  header: {
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#8E8E93",
  },
  scrollView: {
    flex: 1,
  },
  friendItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  friendItemSelected: {
    backgroundColor: "#F0F9FF",
  },
  friendContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    borderColor: "#007AFF",
    backgroundColor: "#007AFF",
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  friendName: {
    fontSize: 16,
    color: "#000000",
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#D1D5DB",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#8E8E93",
    textAlign: "center",
    marginBottom: 24,
  },
});
