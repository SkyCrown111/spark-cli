/**
 * useSearchHighlight — hook for highlighting search matches in text.
 *
 * Provides:
 * - Search query state
 * - Match positions in a text string
 * - Current match index (for n/N navigation)
 * - Highlighted text rendering utility
 *
 * Mirrors cc-haha's useSearchHighlight hook.
 */

import { useState, useCallback, useMemo } from 'react';

// ── Types ──────────────────────────────────────────────

export interface SearchMatch {
  /** Start index of the match */
  start: number;
  /** End index of the match (exclusive) */
  end: number;
}

export interface UseSearchHighlightReturn {
  /** Current search query */
  query: string;
  /** Update the search query */
  setQuery: (query: string) => void;
  /** All matches in the text */
  matches: SearchMatch[];
  /** Index of the currently focused match (-1 if no match) */
  focusIndex: number;
  /** Move to the next match */
  nextMatch: () => void;
  /** Move to the previous match */
  prevMatch: () => void;
  /** Total number of matches */
  matchCount: number;
  /** Whether search is active (query is non-empty) */
  isActive: boolean;
  /** Clear the search */
  clear: () => void;
}

// ── Hook ───────────────────────────────────────────────

/**
 * useSearchHighlight — manages search state and match positions.
 *
 * @param text - The text to search within
 */
export function useSearchHighlight(text: string): UseSearchHighlightReturn {
  const [query, setQueryState] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);

  // Find all matches
  const matches = useMemo((): SearchMatch[] => {
    if (!query) return [];

    const result: SearchMatch[] = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(lowerQuery, searchFrom);
      if (idx === -1) break;

      result.push({ start: idx, end: idx + query.length });
      searchFrom = idx + 1;
    }

    return result;
  }, [text, query]);

  const matchCount = matches.length;
  const isActive = query.length > 0;

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setFocusIndex(0);
  }, []);

  const nextMatch = useCallback(() => {
    if (matchCount === 0) return;
    setFocusIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const prevMatch = useCallback(() => {
    if (matchCount === 0) return;
    setFocusIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const clear = useCallback(() => {
    setQueryState('');
    setFocusIndex(0);
  }, []);

  return {
    query,
    setQuery,
    matches,
    focusIndex: matchCount > 0 ? focusIndex : -1,
    nextMatch,
    prevMatch,
    matchCount,
    isActive,
    clear,
  };
}
