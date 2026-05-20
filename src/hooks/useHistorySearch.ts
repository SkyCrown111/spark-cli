/**
 * useHistorySearch — hook for incremental history search (Ctrl+R).
 *
 * Provides search state management, matching, and navigation
 * for searching through command history.
 */

import { useState, useCallback, useMemo } from 'react';

// ── Types ──────────────────────────────────────────────

export interface HistorySearchState {
  /** Whether search mode is active */
  active: boolean;
  /** Current search query */
  query: string;
  /** Matching history entries */
  matches: string[];
  /** Index of the currently focused match */
  focusIndex: number;
}

// ── Hook ──────────────────────────────────────────────

export function useHistorySearch(history: string[]) {
  const [state, setState] = useState<HistorySearchState>({
    active: false,
    query: '',
    matches: [],
    focusIndex: 0,
  });

  /**
   * Activate search mode (Ctrl+R).
   * Resets query and finds initial matches.
   */
  const activateSearch = useCallback(() => {
    setState({
      active: true,
      query: '',
      matches: history.slice().reverse(),
      focusIndex: 0,
    });
  }, [history]);

  /**
   * Update search query and re-filter matches.
   */
  const updateQuery = useCallback((query: string) => {
    const lower = query.toLowerCase();
    const matches = history
      .filter((entry) => entry.toLowerCase().includes(lower))
      .reverse(); // Most recent first

    setState({
      active: true,
      query,
      matches,
      focusIndex: 0,
    });
  }, [history]);

  /**
   * Move to the next match (Ctrl+R again).
   */
  const nextMatch = useCallback(() => {
    setState((prev) => {
      if (prev.matches.length === 0) return prev;
      return {
        ...prev,
        focusIndex: (prev.focusIndex + 1) % prev.matches.length,
      };
    });
  }, []);

  /**
   * Accept the currently focused match.
   * Returns the selected history entry.
   */
  const acceptMatch = useCallback(
    (): string | undefined => {
      if (!state.active || state.matches.length === 0) return undefined;
      const match = state.matches[state.focusIndex];
      setState({
        active: false,
        query: '',
        matches: [],
        focusIndex: 0,
      });
      return match;
    },
    [state],
  );

  /**
   * Dismiss search without accepting.
   */
  const dismiss = useCallback(() => {
    setState({
      active: false,
      query: '',
      matches: [],
      focusIndex: 0,
    });
  }, []);

  /**
   * Get the currently focused match.
   */
  const focusedMatch = useMemo(() => {
    if (!state.active || state.matches.length === 0) return undefined;
    return state.matches[state.focusIndex];
  }, [state]);

  return {
    ...state,
    focusedMatch,
    activateSearch,
    updateQuery,
    nextMatch,
    acceptMatch,
    dismiss,
  };
}