/**
 * Section Container Component
 * 
 * Logical grouping only.
 * 
 * Rules:
 * - No background color
 * - No elevation
 * - Uses spacing, not borders
 * - Sections are invisible structure
 */

import React from 'react';
import { View, ViewProps } from 'react-native';
import { Spacing } from '../../design';

export interface SectionProps extends ViewProps {
  children: React.ReactNode;
  spacing?: keyof typeof Spacing;
}

export const Section: React.FC<SectionProps> = ({
  children,
  spacing = 'md',
  style,
  ...props
}) => {
  return (
    <View
      style={[
        {
          // We use gap for vertical or horizontal spacing automatically
          gap: Spacing[spacing],
          // Ensure children don't stretch in weird ways inside the section
          flexDirection: 'column',
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

// Styles removed - using inline styles for gap and flexDirection
// This allows the component to work in both vertical and horizontal layouts

