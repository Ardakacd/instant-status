/**
 * Emoji Picker for Status
 *
 * Curated emojis with pagination – no nested scroll, works inside modals.
 */
import React, { useState, useMemo, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Colors, Spacing, Borders, Typography } from "../design";
import { Text } from "./primitives/Text";
import { TextInput } from "./inputs/TextInput";
import emojiData from "unicode-emoji-json";

const ALL_EMOJIS = Object.entries(emojiData).map(([emoji, info]) => ({
  char: emoji,
  name: info.name,
}));

/** Top 18: availability, focus, mood – curated for status vibes */
const CURATED_EMOJI_CHARS = [
  "☕", "🎮", "🎧", "🍺", "🍕", "🚶",  // Availability & social
  "📚", "💻", "🔋", "😴", "✈️", "🏢", // Focus & productivity
  "🔥", "🧊", "🌪️", "🌈", "💊", "🫠", // Mood & energy
];
const CURATED_DATA = CURATED_EMOJI_CHARS.map((char) => {
  const found = ALL_EMOJIS.find((e) => e.char === char);
  return found ?? { char, name: char };
});

const EMOJIS_PER_PAGE = 18;

interface EmojiPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  selectedEmoji,
  onSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return CURATED_DATA;
    return ALL_EMOJIS.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ).slice(0, 60);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / EMOJIS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageData = filteredData.slice(
    currentPage * EMOJIS_PER_PAGE,
    (currentPage + 1) * EMOJIS_PER_PAGE,
  );

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  const renderTile = (item: { char: string; name: string }) => {
    const isSelected = selectedEmoji === item.char;
    return (
      <TouchableOpacity
        key={item.char}
        style={[styles.tile, isSelected && styles.tileSelected]}
        onPress={() => onSelect(item.char)}
        activeOpacity={1}
      >
        <Text style={styles.emojiText}>{item.char}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Search emojis for more..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchInput}
      />

      <View style={styles.gridWrap}>
        {pageData.map((item) => renderTile(item))}
      </View>

      {totalPages > 1 && (
        <View style={styles.pagination}>
          {Array.from({ length: totalPages }, (_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setPage(i)}
              style={[styles.pageBtn, i === currentPage && styles.pageBtnActive]}
            >
              <Text style={[styles.pageNum, i === currentPage && styles.pageNumActive]}>
                {i + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const TILE_SIZE = 52;
const GAP = 8;

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  searchInput: {
    marginBottom: Spacing.sm,
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    marginBottom: Spacing.sm,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  pageBtn: {
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Borders.radius.small,
  },
  pageBtnActive: {
    backgroundColor: Colors.text.primary,
  },
  pageNum: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 14,
    color: Colors.text.secondary,
  },
  pageNumActive: {
    color: Colors.canvas.background,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    backgroundColor: Colors.canvas.background,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary,
    borderRadius: Borders.radius.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  tileSelected: {
    borderColor: Colors.text.primary,
    backgroundColor: Colors.interaction.disabled,
    transform: [{ translateY: 2 }], // The physical "pressed" feel
  },
  emojiText: {
    fontSize: 22,
    lineHeight: 28,
    includeFontPadding: false,
  },
});
