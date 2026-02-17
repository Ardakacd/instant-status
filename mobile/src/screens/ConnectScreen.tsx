import React, { useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { inviteService } from "../services/invite.service";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "../../App";
import Toast from "react-native-toast-message";

import { Colors, Borders, Spacing, Typography } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";
import { TextInput } from "../components/inputs/TextInput";

type Props = NativeStackScreenProps<RootStackParamList, "Connect">;

export default function ConnectScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [inviteCode, setInviteCode] = useState("");
  const [myInviteCode, setMyInviteCode] = useState("");
  const [shareableLink, setShareableLink] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [connectingByLink, setConnectingByLink] = useState(false);
  useEffect(() => {
    loadMyInviteCode();
    generateShareableLink();
  }, [user]);

  useEffect(() => {
    const userId = route.params?.userId;
    if (userId && user) {
      if (userId === user.id) {
        Toast.show({
          type: "info",
          text1: "You cannot connect with yourself. Share this link with a friend instead!",
        });
      } else {
        handleConnectByLink(userId);
      }
    }
  }, [route.params?.userId, user]);

  const loadMyInviteCode = async () => {
    try {
      const result = await inviteService.generateCode();
      setMyInviteCode(result.code);
    } catch (error) {
      console.error("Error loading invite code:", error);
    }
  };

  const generateShareableLink = () => {
    if (user?.id) {
      const universalLink = `https://instantstatus.app/connect/${user.id}`;
      setShareableLink(universalLink);
    }
  };

  const handleCopyCode = async () => {
    if (!myInviteCode) {
      Toast.show({
        type: "error",
        text1: "Unable to copy invite code. Please try again.",
      });
      return;
    }
    try {
      await Clipboard.setStringAsync(myInviteCode);
      Toast.show({
        type: "success",
        text1: "Invite code copied to clipboard",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Failed to copy code. Please try again.",
      });
    }
  };

  const handleShareCode = async () => {
    if (!myInviteCode) {
      Toast.show({
        type: "error",
        text1: "Unable to share invite code. Please try again.",
      });
      return;
    }
    try {
      await Share.share({
        message: `Join me on Instant Status! Use my invite code: ${myInviteCode}`,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleCopyLink = async () => {
    if (!shareableLink) {
      Toast.show({
        type: "error",
        text1: "Unable to copy link. Please try again.",
      });
      return;
    }
    try {
      await Clipboard.setStringAsync(shareableLink);
      Toast.show({
        type: "success",
        text1: "Shareable link copied to clipboard",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Failed to copy link. Please try again.",
      });
    }
  };

  const handleShareLink = async () => {
    if (!shareableLink) {
      Toast.show({
        type: "error",
        text1: "Unable to share link. Please try again.",
      });
      return;
    }
    try {
      const shareMessage = `${shareableLink}\n\nConnect with me on Instant Status!`;
      await Share.share({ message: shareMessage });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleConnectByLink = async (targetUserId: string) => {
    if (!user) return;
    if (user.id === targetUserId) {
      Toast.show({
        type: "info",
        text1: "You cannot connect with yourself. Share this link with a friend instead!",
      });
      return;
    }
    setConnectingByLink(true);
    try {
      const result = await inviteService.connectByLink(targetUserId);
      Toast.show({
        type: "success",
        text1: `Successfully connected with ${result.owner.first_name} ${result.owner.last_name || ""}!`,
      });
      setTimeout(() => {
        navigation.navigate("Main", { screen: "Friends" });
      }, 1500);
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Failed to connect via link. Check your connection and try again.",
      });
    } finally {
      setConnectingByLink(false);
    }
  };

  const handleRedeemCode = async () => {
    if (!inviteCode.trim() || inviteCode.length !== 8) {
      Toast.show({
        type: "error",
        text1: "Please enter a valid 8-character code",
      });
      return;
    }
    setRedeemingCode(true);
    try {
      await inviteService.redeemCode(inviteCode.toUpperCase());
      Toast.show({
        type: "success",
        text1: "Friend added successfully!",
      });
      setInviteCode("");
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: error.message || "Check your connection and try again.",
      });
    } finally {
      setRedeemingCode(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { flexGrow: 1, paddingTop: insets.top + Spacing.sm },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text variant="primary" style={styles.headerTitle}>
            Connect Friends
          </Text>
          <View style={styles.backButton} />
        </View>

        {/* Invite Code */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="keypad"
                size={20}
                color={Colors.interaction.primary}
              />
            </View>
            <View style={styles.cardHeaderText}>
              <Text variant="primary" style={styles.cardTitle}>
                Add Friends With Invite Code
              </Text>
              <Text variant="secondary" style={styles.cardDescription}>
                Share your code or enter a friend's code to connect
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="secondary" style={styles.sectionLabel}>
              Your Invite Code
            </Text>
            <View style={styles.codeContainer}>
              <Text variant="primary" style={styles.codeText}>
                {myInviteCode || "Loading..."}
              </Text>
              <View style={styles.codeActions}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleCopyCode}
                >
                  <Ionicons
                    name="copy-outline"
                    size={20}
                    color={Colors.interaction.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleShareCode}
                >
                  <Ionicons
                    name="share-outline"
                    size={20}
                    color={Colors.interaction.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text variant="secondary" style={styles.sectionLabel}>
              Enter a Code
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                placeholder="Enter invite code"
                value={inviteCode}
                onChangeText={setInviteCode}
                maxLength={8}
                autoCapitalize="characters"
                style={styles.input}
              />
              <Button
                variant="primary"
                onPress={handleRedeemCode}
                loading={redeemingCode}
                disabled={redeemingCode || !inviteCode.trim()}
                fullWidth={false}
                style={styles.redeemButton}
              >
                Connect
              </Button>
            </View>
          </View>
        </View>

        {/* Shareable Link */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, styles.iconContainerMint]}>
              <Ionicons
                name="link"
                size={20}
                color={Colors.interaction.primary}
              />
            </View>
            <View style={styles.cardHeaderText}>
              <Text variant="primary" style={styles.cardTitle}>
                Add Friends By Shareable Link
              </Text>
              <Text variant="secondary" style={styles.cardDescription}>
                Share a link that opens the app and confirms connection
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="secondary" style={styles.sectionLabel}>
              Your Shareable Link
            </Text>
            <View style={styles.linkContainer}>
              <Text
                variant="primary"
                style={styles.linkText}
                numberOfLines={2}
              >
                {shareableLink || "Loading..."}
              </Text>
              <View style={styles.linkActions}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleCopyLink}
                >
                  <Ionicons
                    name="copy-outline"
                    size={20}
                    color={Colors.interaction.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleShareLink}
                >
                  <Ionicons
                    name="share-outline"
                    size={20}
                    color={Colors.interaction.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>
            {connectingByLink && (
              <View style={styles.connectingContainer}>
                <ActivityIndicator
                  size="small"
                  color={Colors.interaction.primary}
                />
                <Text variant="primary" style={styles.connectingText}>
                  Connecting...
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
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
  card: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: "#F9FAFB",
    borderRadius: Borders.radius.medium,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: Borders.radius.medium,
    backgroundColor: Colors.interaction.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  iconContainerMint: {
    backgroundColor: Colors.interaction.primary + "15",
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    marginBottom: Spacing.xs,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: Spacing.xs,
  },
  codeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: Borders.radius.medium,
    padding: Spacing.sm,
    backgroundColor: Colors.canvas.background,
  },
  codeText: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 2,
  },
  codeActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: Borders.radius.medium,
    padding: Spacing.sm,
    backgroundColor: Colors.canvas.background,
  },
  linkText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    marginRight: Spacing.sm,
  },
  linkActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  iconButton: {
    padding: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.text.secondary,
    opacity: 0.3,
    marginVertical: Spacing.md,
  },
  inputContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  input: {
    flex: 1,
    minWidth: 120,
    textAlign: "center",
    letterSpacing: 4,
    fontFamily: Typography.fontFamily.semiBold,
  },
  redeemButton: {
    minWidth: 90,
    flexShrink: 0,
  },
  connectingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  connectingText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.interaction.primary,
  },
});
