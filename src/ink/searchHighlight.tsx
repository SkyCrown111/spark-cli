/**
 * searchHighlight — utilities for rendering highlighted search matches.
 *
 * Provides React components and utility functions for rendering
 * text with search matches highlighted (yellow background).
 */

import React from 'react';
import { Text } from 'ink';
import type { SearchMatch } from './hooks/use-search-highlight.js';

// ── Types ──────────────────────────────────────────────

export interface HighlightedTextProps {
  /** The full text to render */
  text: string;
  /** Match positions to highlight */
  matches: SearchMatch[];
  /** Index of the currently focused match */
  focusIndex: number;
  /** Base text color (default: inherited) */
  color?: string;
}

// ── Component ──────────────────────────────────────────

/**
 * HighlightedText — renders text with search matches highlighted.
 *
 * Non-matching text is rendered normally. Matches are rendered
 * with yellow background. The focused match has an inverted
 * color scheme for visibility.
 */
export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  matches,
  focusIndex,
  color,
}) => {
  if (matches.length === 0) {
    return <Text color={color}>{text}</Text>;
  }

  // Build segments: alternating non-match and match regions
  const segments: Array<{ text: string; isMatch: boolean; isFocused: boolean }> = [];
  let lastEnd = 0;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    // Non-match text before this match
    if (match.start > lastEnd) {
      segments.push({
        text: text.slice(lastEnd, match.start),
        isMatch: false,
        isFocused: false,
      });
    }

    // Match text
    segments.push({
      text: text.slice(match.start, match.end),
      isMatch: true,
      isFocused: i === focusIndex,
    });

    lastEnd = match.end;
  }

  // Trailing non-match text
  if (lastEnd < text.length) {
    segments.push({
      text: text.slice(lastEnd),
      isMatch: false,
      isFocused: false,
    });
  }

  return (
    <Text color={color}>
      {segments.map((seg, i) => {
        if (seg.isMatch && seg.isFocused) {
          // Focused match: inverted colors
          return <Text key={i} backgroundColor="yellow" color="black" bold>{seg.text}</Text>;
        }
        if (seg.isMatch) {
          // Regular match: yellow background
          return <Text key={i} backgroundColor="yellow" color="black">{seg.text}</Text>;
        }
        // Non-match text
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  );
};
