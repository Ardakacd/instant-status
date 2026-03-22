import React, { useState, useEffect, useRef } from "react";
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

import { Colors, Borders, Spacing, Typography, useResponsive, useColors } from "../design";
import { Text } from "../components/primitives/Text";
import { Button } from "../components/actions/Button";
import { TextInput } from "../components/inputs/TextInput";

type Props = NativeStackScreenProps<RootStackParamList, "Connect">;

export default function ConnectScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { horizontalPadding, fs } = useResponsive();
  const colors = useColors();
  const [inviteCode, setInviteCode] = useState("");
  const [myInviteCode, setMyInviteCode] = useState("");
  const [shareableLink, setShareableLink] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [connectingByLink, setConnectingByLink] = useState(false);
  const [inviteCodeError, setInviteCodeError] = useState(false);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current) clearTimeout(navigateTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    loadMyInviteCode();
    generateShareableLink();
  }, [user?.id]);

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
    setInviteCodeError(false);
    try {
      const result = await inviteService.generateCode();
      setMyInviteCode(result.code);
    } catch {
      setInviteCodeError(true);
      Toast.show({
        type: "error",
        text1: "Failed to load your invite code. Check your connection.",
      });
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
        message: `Join me on Instant Status!\n\nMy invite code:\n${myInviteCode}`,
      });
    } catch {
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
    } catch {
    }
  };

  const handleConnectByLink = async (targetUserId: string) => {
    if (!user) return;
    if (user.id === targetUserId) {
      Toast.show({
        type: "error",
        text1: "You cannot connect with yourself.",
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
      navigateTimeoutRef.current = setTimeout(() => {
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
    if (!/^[A-Z0-9]{8}$/.test(inviteCode.trim().toUpperCase())) {
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
    <View style={[styles.container, { backgroundColor: colors.canvas.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            flexGrow: 1,
            paddingTop: insets.top + Spacing.sm,
            paddingHorizontal: horizontalPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text variant="primary" style={[styles.headerTitle, { fontSize: fs(18) }]}>
            Connect Friends
          </Text>
          <View style={styles.backButton} />
        </View>

        {/* Invite Code */}
        <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>INVITE CODE</Text>

          {/* Your code display */}
          <View style={[styles.codeDisplay, { backgroundColor: colors.canvas.background }]}>
            {inviteCodeError ? (
              <TouchableOpacity onPress={loadMyInviteCode}>
                <Text style={[styles.retryText, { color: colors.interaction.primary }]}>Tap to retry</Text>
              </TouchableOpacity>
            ) : (
              <Text variant="primary" style={[styles.codeText, { fontSize: fs(26) }]}>
                {myInviteCode || "———"}
              </Text>
            )}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionPill, { backgroundColor: colors.canvas.background }]} onPress={handleCopyCode}>
              <Ionicons name="copy-outline" size={16} color={colors.interaction.primary} />
              <Text style={[styles.actionPillText, { color: colors.interaction.primary }]}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionPill, { backgroundColor: colors.canvas.background }]} onPress={handleShareCode}>
              <Ionicons name="share-outline" size={16} color={colors.interaction.primary} />
              <Text style={[styles.actionPillText, { color: colors.interaction.primary }]}>Share</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.text.secondary }]} />

          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>ENTER A FRIEND'S CODE</Text>
          <View style={styles.inputContainer}>
            <TextInput
              placeholder="8-character code"
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
              fullWidth
            >
              Connect
            </Button>
          </View>
        </View>

        {/* Shareable Link */}
        <View style={[styles.card, { backgroundColor: colors.canvas.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>SHAREABLE LINK</Text>
          <Text variant="secondary" style={styles.linkDescription}>
            Send a link that instantly connects you when opened.
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionPill, { backgroundColor: colors.canvas.background }]} onPress={handleCopyLink}>
              <Ionicons name="copy-outline" size={16} color={colors.interaction.primary} />
              <Text style={[styles.actionPillText, { color: colors.interaction.primary }]}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionPill, { backgroundColor: colors.canvas.background }]} onPress={handleShareLink}>
              <Ionicons name="share-outline" size={16} color={colors.interaction.primary} />
              <Text style={[styles.actionPillText, { color: colors.interaction.primary }]}>Share Link</Text>
            </TouchableOpacity>
          </View>

          {connectingByLink && (
            <View style={styles.connectingContainer}>
              <ActivityIndicator size="small" color={colors.interaction.primary} />
              <Text variant="secondary" style={styles.connectingText}>Connecting…</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Borders.radius.medium,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  codeDisplay: {
    paddingVertical: Spacing.lg,
    borderRadius: Borders.radius.medium,
    marginBottom: Spacing.md,
    overflow: "visible",
  },
  codeText: {
    fontFamily: Typography.fontFamily.semiBold,
    letterSpacing: 6,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
    lineHeight: 36,
  },
  retryText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  actionPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    borderRadius: Borders.radius.medium,
    paddingVertical: Spacing.sm,
  },
  actionPillText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.3,
    marginBottom: Spacing.md,
  },
  inputContainer: {
    gap: Spacing.sm,
  },
  input: {
    width: "100%",
    textAlign: "center",
    letterSpacing: 4,
    fontFamily: Typography.fontFamily.semiBold,
  },
  linkDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  connectingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  connectingText: {
    fontSize: 14,
  },
});
