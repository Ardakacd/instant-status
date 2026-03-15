import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type WidgetConfigurationScreenProps,
  requestWidgetUpdate,
} from "react-native-android-widget";
import { SAFE_AREA_BOTTOM } from "../src/design";
import {
  InstantStatusWidget,
  type FriendStatusWidgetItem,
  type WidgetLayoutSize,
  type WidgetBackgroundStyle,
  WIDGET_BACKGROUND_OPTIONS,
} from "./InstantStatusWidget";
import Sentry from "../sentry";

function getWidgetLayout(width: number, height: number): WidgetLayoutSize {
  const minDim = Math.min(width, height);
  if (width < 200 || minDim < 140) return "small";
  if (width < 350 && height < 280) return "medium";
  return "large";
}

const WIDGET_DATA_KEY = "widget_status_data";
const WIDGET_CONFIG_KEY_PREFIX = "widget_config_";
const WIDGET_CONFIG_BACKGROUND_PREFIX = "widget_config_background_";
const IS_PREMIUM_KEY = "is_premium";

export function WidgetConfigurationScreen(
  props: WidgetConfigurationScreenProps
) {
  return (
    <SafeAreaProvider>
      <WidgetConfigurationScreenContent {...props} />
    </SafeAreaProvider>
  );
}

function WidgetConfigurationScreenContent({
  widgetInfo,
  renderWidget,
  setResult,
}: WidgetConfigurationScreenProps) {
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState<FriendStatusWidgetItem[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(
    new Set()
  );
  const [backgroundStyle, setBackgroundStyle] =
    useState<WidgetBackgroundStyle>("default");
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const configKey = `${WIDGET_CONFIG_KEY_PREFIX}${String(widgetInfo.widgetId)}`;
  const bgConfigKey = `${WIDGET_CONFIG_BACKGROUND_PREFIX}${String(
    widgetInfo.widgetId
  )}`;

  useEffect(() => {
    loadFriendsAndSelection();
  }, []);

  async function loadFriendsAndSelection() {
    try {
      const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
      if (data) {
        const parsedData: FriendStatusWidgetItem[] = JSON.parse(data);
        setFriends(parsedData);
      }

      const savedSelection = await AsyncStorage.getItem(configKey);
      if (savedSelection) {
        const selectedIds: string[] = JSON.parse(savedSelection);
        setSelectedFriendIds(new Set(selectedIds));
      } else {
        // No saved selection: pre-select all friends (same as iOS "no config = all")
        const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
        if (data) {
          const parsedData: FriendStatusWidgetItem[] = JSON.parse(data);
          setSelectedFriendIds(new Set(parsedData.map((f) => f.id)));
        }
      }

      const isPremiumRaw = await AsyncStorage.getItem(IS_PREMIUM_KEY);
      setIsPremium(isPremiumRaw === "true");

      const savedBg = await AsyncStorage.getItem(bgConfigKey);
      if (savedBg && WIDGET_BACKGROUND_OPTIONS.some((o) => o.value === savedBg)) {
        setBackgroundStyle(savedBg as WidgetBackgroundStyle);
      }
    } catch (error) {
      Sentry.Native.captureException(error);
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
      const selectedIds = Array.from(selectedFriendIds);
      await AsyncStorage.setItem(configKey, JSON.stringify(selectedIds));
      if (isPremium) {
        await AsyncStorage.setItem(bgConfigKey, backgroundStyle);
      }

      const selectedFriends = friends.filter((f) =>
        selectedFriendIds.has(f.id)
      );
      const layoutSize = getWidgetLayout(
        widgetInfo.width,
        widgetInfo.height
      );
      // Config screen only supports single element; use light variant for preview.
      // Actual widget uses light/dark variants from task handler.
      renderWidget(
        <InstantStatusWidget
          friends={selectedFriends}
          hasAnyFriends={friends.length > 0}
          layoutSize={layoutSize}
          isPremium={isPremium}
          backgroundStyle={backgroundStyle}
          isDarkMode={false}
        />
      );

      await requestWidgetUpdate({
        widgetName: "InstantStatusWidget",
      } as any);
      setResult("ok");
    } catch (error) {
      Sentry.Native.captureException(error);
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
        <View
          style={[
            styles.emptyContainer,
            { paddingBottom: 40 + insets.bottom },
          ]}
        >
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

      {isPremium && (
        <View style={styles.backgroundSection}>
          <Text style={styles.sectionLabel}>Background</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.backgroundOptions}
          >
            {WIDGET_BACKGROUND_OPTIONS.map((opt) => {
              const isSelected = backgroundStyle === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.backgroundChip,
                    isSelected && styles.backgroundChipSelected,
                  ]}
                  onPress={() => setBackgroundStyle(opt.value)}
                >
                  <Text
                    style={[
                      styles.backgroundChipText,
                      isSelected && styles.backgroundChipTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

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

      <View
        style={[
          styles.footer,
          { paddingBottom: SAFE_AREA_BOTTOM + insets.bottom },
        ]}
      >
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
  backgroundSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 8,
  },
  backgroundOptions: {
    flexDirection: "row",
    paddingRight: 20,
  },
  backgroundChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    marginRight: 8,
  },
  backgroundChipSelected: {
    backgroundColor: "#007AFF",
  },
  backgroundChipText: {
    fontSize: 13,
    color: "#374151",
  },
  backgroundChipTextSelected: {
    color: "#FFFFFF",
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
