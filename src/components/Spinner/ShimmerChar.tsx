/**
 * ShimmerChar — renders a single character with shimmer animation.
 *
 * When the character's index matches the glimmerIndex, it renders
 * in the shimmerColor; otherwise it renders in the messageColor.
 * This creates a "sweep" effect as the glimmerIndex advances,
 * mimicking Claude Code's per-character shimmer animation.
 *
 * Inspired by Claude Code's ShimmerChar component.
 */

import React from 'react';
import { Text } from 'ink';

// ── Props ──────────────────────────────────────────────

export interface ShimmerCharProps {
  /** The character to render */
  char: string;
  /** This character's position in the text */
  index: number;
  /** Current glimmer sweep position */
  glimmerIndex: number;
  /** Default color for non-shimmered characters */
  messageColor?: string;
  /** Color when the glimmer passes over this character */
  shimmerColor?: string;
}

// ── Component ──────────────────────────────────────────

/**
 * ShimmerChar — single character with shimmer sweep effect.
 *
 * The "glimmer" is a bright sweep that moves across the text
 * at ~50ms intervals. When the sweep passes over this character,
 * it briefly changes to the shimmerColor before returning to
 * the messageColor.
 *
 * The sweep has a ~5-character "tail" that fades out behind
 * the glimmer position, creating a comet-like effect.
 */
export const ShimmerChar: React.FC<ShimmerCharProps> = ({
  char,
  index,
  glimmerIndex,
  messageColor,
  shimmerColor = 'white',
}) => {
  // Distance from glimmer: 0 = directly under glimmer, 1 = one behind, etc.
  const dist = glimmerIndex - index;

  // Only shimmer characters within the sweep window (glitter + 4-char tail)
  if (dist >= 0 && dist <= 4) {
    // At glimmer position: full shimmer color, bold
    if (dist === 0) {
      return (
        <Text color={shimmerColor} bold>
          {char}
        </Text>
      );
    }
    // Tail: progressively dimmer shimmer
    // dist 1 = 80% brightness, dist 2 = 60%, etc.
    if (dist <= 2) {
      return <Text color={shimmerColor}>{char}</Text>;
    }
    // Faint tail
    return (
      <Text color={shimmerColor} dimColor>
        {char}
      </Text>
    );
  }

  // Outside sweep: normal message color
  if (messageColor) {
    return <Text color={messageColor}>{char}</Text>;
  }

  return <Text>{char}</Text>;
};
