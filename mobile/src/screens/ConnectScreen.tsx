import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
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

  // Handle deep link when screen opens with userId parameter
  useEffect(() => {
    const userId = route.params?.userId;
    if (userId && user) {
      if (userId === user.id) {
        Alert.alert(
          "Cannot Connect",
          "You cannot connect with yourself. Share this link with a friend instead!"
        );
      } else {
        handleConnectByLink(userId);
      }
    }
  }, [route.params?.userId, user]);

  const loadMyInviteCode = async () => {
    try {
      // Generate or get existing invite code
      const result = await inviteService.generateCode();
      setMyInviteCode(result.code);
    } catch (error) {
      console.error("Error loading invite code:", error);
    }
  };

  const generateShareableLink = () => {
    if (user?.id) {
      // Generate universal link using Firebase Hosting domain
      // This will be intercepted by iOS/Android if app is installed
      // Otherwise, it will open the web page which redirects to the app
      const universalLink = `https://instantstatus.app/connect/${user.id}`;
      setShareableLink(universalLink);
    }
  };

  const handleCopyCode = async () => {
    if (!myInviteCode) {
      Alert.alert("Error", "No invite code available");
      return;
    }
    try {
      await Clipboard.setStringAsync(myInviteCode);
      Alert.alert("Copied!", "Invite code copied to clipboard");
    } catch (error) {
      Alert.alert("Error", "Failed to copy code");
    }
  };

  const handleShareCode = async () => {
    if (!myInviteCode) {
      Alert.alert("Error", "No invite code available");
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
      Alert.alert("Error", "No shareable link available");
      return;
    }
    try {
      await Clipboard.setStringAsync(shareableLink);
      Alert.alert("Copied!", "Shareable link copied to clipboard");
    } catch (error) {
      Alert.alert("Error", "Failed to copy link");
    }
  };

  const handleShareLink = async () => {
    if (!shareableLink) {
      Alert.alert("Error", "No shareable link available");
      return;
    }
    try {
      // WhatsApp link detection requirements:
      // 1. URL must start with http:// or https://
      // 2. URL should be on its own line or at sentence boundaries
      // 3. No extra characters or spaces around the URL
      // 4. URL should be a complete, valid URL

      // Put URL first on its own line for best recognition
      const shareMessage = `${shareableLink}\n\nConnect with me on Instant Status!`;

      await Share.share({
        message: shareMessage,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleConnectByLink = async (targetUserId: string) => {
    if (!user) {
      return;
    }

    if (user.id === targetUserId) {
      Alert.alert(
        "Cannot Connect",
        "You cannot connect with yourself. Share this link with a friend instead!"
      );
      return;
    }

    setConnectingByLink(true);
    try {
      const result = await inviteService.connectByLink(targetUserId);
      Alert.alert(
        "Success",
        `Successfully connected with ${result.owner.first_name} ${
          result.owner.last_name || ""
        }!`,
        [
          {
            text: "OK",
            onPress: () => {
              // Navigate back to home or friends screen
              navigation.navigate("Main", { screen: "Friends" });
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to connect via link");
    } finally {
      setConnectingByLink(false);
    }
  };

  const handleRedeemCode = async () => {
    if (!inviteCode.trim() || inviteCode.length !== 8) {
      Alert.alert("Error", "Please enter a valid 8-character code");
      return;
    }

    setRedeemingCode(true);
    try {
      await inviteService.redeemCode(inviteCode.toUpperCase());
      Alert.alert("Success", "Friend added successfully!", [
        {
          text: "OK",
          onPress: () => {
            setInviteCode("");
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to redeem code");
    } finally {
      setRedeemingCode(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={[styles.header, { paddingTop: Math.max(insets.top + 10, 40) }]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Connect Friends</Text>
          <View style={styles.backButton} />
        </View>

        {/* Method 1: Invite Code */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name="keypad" size={24} color="#007AFF" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Add Friends With Invite Code</Text>
              <Text style={styles.cardDescription}>
                Share your code or enter a friend's code to connect
              </Text>
            </View>
          </View>

          {/* My Invite Code */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your Invite Code</Text>
            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>
                {myInviteCode || "Loading..."}
              </Text>
              <View style={styles.codeActions}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleCopyCode}
                >
                  <Ionicons name="copy-outline" size={20} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleShareCode}
                >
                  <Ionicons name="share-outline" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Enter Code */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Enter a Code</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter invite code"
                value={inviteCode}
                onChangeText={setInviteCode}
                maxLength={8}
                autoCapitalize="characters"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={[
                  styles.redeemButton,
                  redeemingCode && styles.redeemButtonDisabled,
                ]}
                onPress={handleRedeemCode}
                disabled={redeemingCode || !inviteCode.trim()}
              >
                {redeemingCode ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.redeemButtonText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Method 2: Shareable Link */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name="link" size={24} color="#10B981" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>
                Add Friends By Shareable Link
              </Text>
              <Text style={styles.cardDescription}>
                Share a link that opens the app and confirms connection
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your Shareable Link</Text>
            <View style={styles.linkContainer}>
              <Text style={styles.linkText} numberOfLines={2}>
                {shareableLink || "Loading..."}
              </Text>
              <View style={styles.linkActions}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleCopyLink}
                >
                  <Ionicons name="copy-outline" size={20} color="#10B981" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleShareLink}
                >
                  <Ionicons name="share-outline" size={20} color="#10B981" />
                </TouchableOpacity>
              </View>
            </View>
            {connectingByLink && (
              <View style={styles.connectingContainer}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.connectingText}>Connecting...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#6B7280" />
          <Text style={styles.infoText}>
            Both methods work globally and don't require contacts. Invite codes
            are single-use, while shareable links can be used multiple times.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  card: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  codeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  codeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 2,
    fontFamily: "monospace",
  },
  codeActions: {
    flexDirection: "row",
    gap: 8,
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  linkText: {
    flex: 1,
    minWidth: 0, // Allow flex shrinking for text truncation
    fontSize: 14,
    color: "#111827",
    marginRight: 8,
  },
  linkActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 20,
  },
  inputContainer: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap", // Allow wrapping on very small screens
  },
  input: {
    flex: 1,
    minWidth: 120, // Minimum width for input on small screens
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#F9FAFB",
    textAlign: "center",
    letterSpacing: 4,
    fontFamily: "monospace",
  },
  redeemButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 90, // Reduced from 100 for better fit on small screens
    flexShrink: 0, // Prevent button from shrinking
  },
  redeemButtonDisabled: {
    opacity: 0.5,
  },
  redeemButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  infoCard: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  connectingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  connectingText: {
    fontSize: 14,
    color: "#10B981",
    fontWeight: "500",
  },
});
