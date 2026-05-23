/**
 * ShimmeredInput — renders text with a per-character shimmer sweep.
 *
 * A "glimmer" sweeps across the text at ~50ms intervals, briefly
 * brightening each character as it passes. This creates the signature
 * Claude Code "shimmer" animation that makes the loading indicator
 * feel alive and polished.
 *
 * Unlike the simple SpinnerWithVerb that uses a braille dot cycle,
 * ShimmeredInput provides a smooth, text-level animation that
 * feels more integrated with the content.
 *
 * Inspired by Claude Code's HighlightedInput / ShimmeredInput.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text } from 'ink';
import { ShimmerChar } from './ShimmerChar.js';

// ── Props ──────────────────────────────────────────────

export interface ShimmeredInputProps {
  /** Text to render with shimmer */
  text: string;
  /** Default color for non-shimmered text */
  messageColor?: string;
  /** Color when the glimmer passes over text */
  shimmerColor?: string;
  /** Whether the shimmer is active (paused when false) */
  active?: boolean;
  /** Shimmer sweep interval in ms (default 50) */
  interval?: number;
  /** Padding to add before/after the shimmer sweep range */
  sweepPadding?: number;
}

// ── Hook: useAnimationFrame ────────────────────────────

/**
 * Lightweight animation frame hook for shimmer.
 * Returns the current time in ms since the animation started.
 */
function useShimmerTimer(active: boolean, interval: number): number {
  const [time, setTime] = useState(0);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (frameRef.current) clearInterval(frameRef.current);
      return;
    }

    let elapsed = 0;
    frameRef.current = setInterval(() => {
      elapsed += interval;
      setTime(elapsed);
    }, interval);

    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
    };
  }, [active, interval]);

  return time;
}

// ── Component ──────────────────────────────────────────

/**
 * ShimmeredInput — text with per-character shimmer sweep animation.
 */
export const ShimmeredInput: React.FC<ShimmeredInputProps> = ({
  text,
  messageColor = 'cyan',
  shimmerColor = 'white',
  active = true,
  interval = 50,
  sweepPadding = 10,
}) => {
  const time = useShimmerTimer(active, interval);

  // Compute the sweep range and current glimmer position
  const textLength = text.length;
  const sweepStart = useMemo(() => -sweepPadding, [sweepPadding]);
  const cycleLength = useMemo(() => textLength + sweepPadding * 2, [textLength, sweepPadding]);

  // Current glimmer position: cycles from sweepStart to sweepStart + cycleLength
  const glimmerIndex = active ? sweepStart + (Math.floor(time / interval) % cycleLength) : -100; // Off-screen when inactive

  // Split text into lines for rendering
  const lines = useMemo(() => text.split('\n'), [text]);

  // Track character position across lines
  let charOffset = 0;

  return (
    <Box flexDirection="column">
      {lines.map((line, lineIndex) => {
        const lineStartOffset = charOffset;
        charOffset += line.length + 1; // +1 for the newline

        return (
          <Box key={lineIndex}>
            {line.length === 0 ? (
              <Text> </Text>
            ) : (
              <Text>
                {line.split('').map((char, charIndex) => (
                  <ShimmerChar
                    key={charIndex}
                    char={char}
                    index={lineStartOffset + charIndex}
                    glimmerIndex={glimmerIndex}
                    messageColor={messageColor}
                    shimmerColor={shimmerColor}
                  />
                ))}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
