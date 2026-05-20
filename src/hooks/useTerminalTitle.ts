/**
 * useTerminalTitle — hook for animating the terminal window title.
 *
 * When a query is running, shows an animated prefix (⠂/⠐ rotating).
 * When idle, shows a static "✳ SparkCLI" title.
 */

import { useEffect, useRef } from 'react';
import { useAppState } from '../state/AppState.js';

// ── Constants ──────────────────────────────────────────

const ANIMATION_FRAMES = ['⠂', '⠐', '⠃', '⠑', '⠄', '⠒'];
const STATIC_TITLE = '✳ SparkCLI';
const ANIMATE_INTERVAL = 300; // ms

// ── Hook ──────────────────────────────────────────────

export function useTerminalTitle(): void {
  const loading = useAppState((s) => s.loading);
  const frameRef = useRef(0);

  useEffect(() => {
    // Only animate if we can write to stdout (terminal title support)
    if (!process.stdout?.write) return;

    if (loading) {
      // Animate title while loading
      const timer = setInterval(() => {
        const frame = ANIMATION_FRAMES[frameRef.current % ANIMATION_FRAMES.length];
        frameRef.current++;
        try {
          process.stdout.write(`\x1b]0;${frame} SparkCLI — working...\x07`);
        } catch {
          // Terminal may not support title setting
        }
      }, ANIMATE_INTERVAL);

      return () => {
        clearInterval(timer);
        try {
          process.stdout.write(`\x1b]0;${STATIC_TITLE}\x07`);
        } catch {
          // Ignore
        }
      };
    } else {
      // Static title when idle
      try {
        process.stdout.write(`\x1b]0;${STATIC_TITLE}\x07`);
      } catch {
        // Ignore
      }
    }
  }, [loading]);
}