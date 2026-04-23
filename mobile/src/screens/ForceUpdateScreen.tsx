import React from "react";
import { View, Text, StyleSheet, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../contexts/ThemeContext";
import { Button } from "../components/actions/Button";

const IOS_STORE_URL = "https://apps.apple.com/app/id6762419531";
const ANDROID_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.arda.instantstatusapp";

export function ForceUpdateScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const handleUpdate = () => {
    const url = Platform.OS === "ios" ? IOS_STORE_URL : ANDROID_STORE_URL;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.canvas.background,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Update Required
        </Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          A new version of Instant Status is available. Please update to
          continue using the app.
        </Text>
        <Button onPress={handleUpdate}>Update Now</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  content: {
    alignItems: "center",
    maxWidth: 300,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
});
