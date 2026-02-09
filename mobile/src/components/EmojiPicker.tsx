/**
 * Pro Emoji Picker for Large Datasets
 * 
 * Features: Optimized FlatList, Search logic, Neobrutalist styling
 */
import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Borders } from '../design';
import { Text } from './primitives/Text';
import { TextInput } from './inputs/TextInput';
import emojiData from 'unicode-emoji-json';

const ALL_EMOJIS = Object.entries(emojiData).map(([emoji, info]) => ({
  char: emoji,
  name: info.name,
}));

interface EmojiPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ selectedEmoji, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = useMemo(() => {
    if (!searchQuery) return ALL_EMOJIS.slice(0, 300); // Limit initial view for speed
    return ALL_EMOJIS.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 100); // Limit search results to 100
  }, [searchQuery]);

  const renderItem = ({ item }: { item: { char: string; name: string } }) => {
    const isSelected = selectedEmoji === item.char;
    return (
      <TouchableOpacity
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
        placeholder="Search emojis..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchInput}
      />
      
      <FlatList
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={item => item.char}
        numColumns={5}
        columnWrapperStyle={styles.columnWrapper}
        initialNumToRender={30}
        windowSize={5} // Helps memory on the A15
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 450,
    marginVertical: Spacing.md,
  },
  searchInput: {
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.md,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 10,
    paddingBottom: 10,
  },
  tile: {
    width: 62,
    height: 62,
    backgroundColor: Colors.canvas.background,
    borderWidth: Borders.width,
    borderColor: Colors.text.secondary,
    borderRadius: Borders.radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    borderColor: Colors.text.primary,
    backgroundColor: Colors.interaction.disabled,
    transform: [{ translateY: 2 }], // The physical "pressed" feel
  },
  emojiText: {
    fontSize: 26,
  },
});
