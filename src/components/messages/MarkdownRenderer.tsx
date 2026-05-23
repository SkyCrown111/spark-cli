/**
 * MarkdownRenderer — terminal markdown rendering with syntax
 * highlighting, table support, and styled headings.
 *
 * Uses `marked` + `marked-terminal` (already in deps) to produce
 * ANSI-colored output that Ink's <Text> can render.
 *
 * Falls back to plain text if the libraries fail to load.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Text } from 'ink';

// ── Types ──────────────────────────────────────────────

interface MarkdownRendererProps {
  children: string;
}

// ── Lazy-loaded marked + marked-terminal ──

type MarkedParseFn = (src: string, opts: { async: false }) => string | Promise<string>;

let markedParse: MarkedParseFn | null = null;
let loadPromise: Promise<boolean> | null = null;
let configured = false;

async function ensureConfigured(): Promise<boolean> {
  if (configured) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const [{ marked }, { markedTerminal }] = await Promise.all([
        import('marked'),
        import('marked-terminal'),
      ]);

      // Register marked-terminal as a marked extension
      marked.use(
        markedTerminal({
          showSectionPrefix: false,
          tab: 2,
        }),
      );

      markedParse = marked.parse as MarkedParseFn;
      configured = true;
      return true;
    } catch {
      return false;
    }
  })();

  return loadPromise;
}

// ── Component ──

/**
 * MarkdownRenderer — renders markdown with terminal styling.
 *
 * Supports:
 * - **Bold**, *italic*, `inline code`
 * - Code blocks with syntax highlighting (via cli-highlight)
 * - Tables (GFM)
 * - Headings (colored)
 * - Lists (bulleted/numbered)
 * - Blockquotes
 * - Links (showing text with URL in parentheses)
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ children }) => {
  const [ready, setReady] = useState(configured);

  useEffect(() => {
    if (!ready) {
      ensureConfigured().then((ok) => {
        if (ok) setReady(true);
      });
    }
  }, [ready]);

  const rendered = useMemo(() => {
    if (!ready || !markedParse) return null;

    try {
      const result = markedParse(children, { async: false });
      return typeof result === 'string' ? result : null;
    } catch {
      return null;
    }
  }, [ready, children]);

  if (rendered !== null) {
    return <Text>{rendered}</Text>;
  }

  return <Text>{children}</Text>;
};
