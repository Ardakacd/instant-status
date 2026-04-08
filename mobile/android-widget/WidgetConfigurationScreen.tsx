import React, { useCallback, useEffect, useRef, useState } from "react";
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
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { WidgetPreview, requestWidgetUpdate } from "react-native-android-widget";
import { Colors, Borders, Spacing, Typography, SAFE_AREA_BOTTOM } from "../src/design";
import {
  InstantStatusWidget,
  type FriendStatusWidgetItem,
  type WidgetBackgroundStyle,
  WIDGET_BACKGROUND_OPTIONS,
} from "./InstantStatusWidget";
import {
  WIDGET_DATA_KEY,
  WIDGET_CONFIG_KEY_PREFIX,
  WIDGET_CONFIG_BACKGROUND_PREFIX,
  IS_PREMIUM_KEY,
} from "./widget-shared";
import Sentry from "../sentry";

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
  const originalBackground = useRef<WidgetBackgroundStyle>("default");
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      let parsedFriends: FriendStatusWidgetItem[] = [];
      if (data) {
        parsedFriends = JSON.parse(data);
        setFriends(parsedFriends);
      }

      const savedSelection = await AsyncStorage.getItem(configKey);
      if (savedSelection) {
        const selectedIds: string[] = JSON.parse(savedSelection);
        // Match iOS: empty stored selection means "all friends", not an empty widget.
        if (selectedIds.length > 0) {
          setSelectedFriendIds(new Set(selectedIds));
        } else {
          setSelectedFriendIds(new Set(parsedFriends.map((f) => f.id)));
        }
      } else {
        // No saved selection: pre-select all friends (same as iOS "no config = all")
        setSelectedFriendIds(new Set(parsedFriends.map((f) => f.id)));
      }

      const isPremiumRaw = await AsyncStorage.getItem(IS_PREMIUM_KEY);
      setIsPremium(isPremiumRaw === "true");

      const savedBg = await AsyncStorage.getItem(bgConfigKey);
      if (savedBg && WIDGET_BACKGROUND_OPTIONS.some((o) => o.value === savedBg)) {
        setBackgroundStyle(savedBg as WidgetBackgroundStyle);
        originalBackground.current = savedBg as WidgetBackgroundStyle;
      }
    } catch (error) {
      Sentry.captureException(error);
    } finally {
      setLoading(false);
    }
  }

  function previewBackground(bg: WidgetBackgroundStyle) {
    setBackgroundStyle(bg);
    const selectedFriends = friends.filter((f) => selectedFriendIds.has(f.id));
    renderWidget(
      <InstantStatusWidget
        friends={selectedFriends}
        hasAnyFriends={friends.length > 0}
        isPremium={isPremium}
        backgroundStyle={bg}
        isDarkMode={false}
        widgetWidthDp={widgetInfo.width}
        widgetHeightDp={widgetInfo.height}
      />
    );
  }

  // Keyed on backgroundStyle so WidgetPreview re-renders when the bg chip changes
  const previewKey = `${backgroundStyle}-${selectedFriendIds.size}`;
  const previewRenderWidget = useCallback(
    () => {
      const selectedFriends = friends.filter((f) => selectedFriendIds.has(f.id));
      return (
        <InstantStatusWidget
          friends={selectedFriends}
          hasAnyFriends={friends.length > 0}
          isPremium={isPremium}
          backgroundStyle={backgroundStyle}
          isDarkMode={false}
          widgetWidthDp={widgetInfo.width}
          widgetHeightDp={widgetInfo.height}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backgroundStyle, selectedFriendIds, friends, isPremium]
  );

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
    if (saving) return;
    setSaving(true);
    try {
      const selectedIds = Array.from(selectedFriendIds);
      await AsyncStorage.setItem(configKey, JSON.stringify(selectedIds));
      if (isPremium) {
        await AsyncStorage.setItem(bgConfigKey, backgroundStyle);
      }

      const selectedFriends = friends.filter((f) =>
        selectedFriendIds.has(f.id)
      );
      const widgetWidthDp  = widgetInfo.width;
      const widgetHeightDp = widgetInfo.height;
      renderWidget(
        <InstantStatusWidget
          friends={selectedFriends}
          hasAnyFriends={friends.length > 0}
          isPremium={isPremium}
          backgroundStyle={backgroundStyle}
          isDarkMode={false}
          widgetHeightDp={widgetHeightDp}
          widgetWidthDp={widgetWidthDp}
        />
      );

      // Trigger widgetTaskHandler for all instances so dark mode and
      // other widget instances also pick up the new background immediately.
      type TriggerOnly = { widgetName: string };
      (requestWidgetUpdate as unknown as (p: TriggerOnly) => Promise<void>)({
        widgetName: "InstantStatusWidget",
      }).catch(() => {});

      setResult("ok");
    } catch (error) {
      Sentry.captureException(error);
      setResult("cancel");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Restore the original background if it was previewed but not saved.
    if (backgroundStyle !== originalBackground.current) {
      previewBackground(originalBackground.current);
    }
    setResult("cancel");
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.interaction.primary} />
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
          <TouchableOpacity style={styles.emptyCancelButton} onPress={handleCancel}>
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

      {/* Live widget preview */}
      <View style={styles.previewSection}>
        <Text style={[styles.sectionLabel, { alignSelf: "flex-start" }]}>Preview</Text>
        <View style={styles.previewContainer}>
          <WidgetPreview
            key={previewKey}
            renderWidget={previewRenderWidget}
            width={widgetInfo.width}
            height={widgetInfo.height}
          />
        </View>
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
                  onPress={() => previewBackground(opt.value)}
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
          disabled={selectedFriendIds.size === 0 || saving}
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
    backgroundColor: Colors.canvas.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 16,
    color: Colors.text.secondary,
  },
  header: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text.secondary + "40",
  },
  title: {
    fontSize: 24,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  previewSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text.secondary + "40",
    alignItems: "center",
  },
  previewContainer: {
    borderRadius: Borders.radius.medium,
    overflow: "hidden",
  },
  backgroundSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.text.secondary + "40",
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
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
    backgroundColor: Colors.interaction.primary,
  },
  backgroundChipText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  backgroundChipTextSelected: {
    color: Colors.canvas.background,
  },
  scrollView: {
    flex: 1,
  },
  friendItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  friendItemSelected: {
    backgroundColor: Colors.interaction.primary + "20",
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
    borderColor: Colors.interaction.disabled,
    marginRight: Spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    borderColor: Colors.interaction.primary,
    backgroundColor: Colors.interaction.primary,
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: Colors.canvas.background,
  },
  friendName: {
    fontSize: 16,
    color: Colors.text.primary,
  },
  footer: {
    flexDirection: "row",
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.text.secondary + "40",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: Borders.radius.small,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  emptyCancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: Borders.radius.small,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: Borders.radius.small,
    backgroundColor: Colors.interaction.primary,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: Colors.interaction.disabled,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.canvas.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
});
