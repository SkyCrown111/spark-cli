/**
 * useTypeahead — hook for managing autocomplete/typeahead behavior.
 *
 * Provides suggestion filtering, selection cycling, and
 * completion insertion logic for the PromptInput component.
 *
 * Supports:
 * - /slash command completion (from registry or built-in list)
 * - @file reference completion (from project filesystem)
 * - Fuzzy matching for both types
 */

import { useState, useCallback, useMemo } from 'react';
import {
  BUILTIN_COMMAND_SUGGESTIONS,
  type SuggestionItem,
} from '../utils/suggestions/commandSuggestions.js';

// ── Types ──────────────────────────────────────────────

export interface TypeaheadState {
  /** Whether suggestions are currently visible */
  visible: boolean;
  /** Current filtered suggestions */
  suggestions: SuggestionItem[];
  /** Index of the currently focused suggestion */
  focusIndex: number;
  /** The partial input being completed */
  query: string;
  /** The kind of typeahead active */
  kind: 'command' | 'file' | 'none';
}

// ── Fuzzy match ──

/**
 * Fuzzy match: checks if all characters of `pattern` appear
 * in `text` in order (not necessarily contiguous).
 * Returns a score (higher = better match) or -1 for no match.
 */
function fuzzyScore(pattern: string, text: string): number {
  if (!pattern) return 1;

  const pLower = pattern.toLowerCase();
  const tLower = text.toLowerCase();

  let pi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < tLower.length && pi < pLower.length; ti++) {
    if (tLower[ti] === pLower[pi]) {
      score += 1;
      // Bonus for consecutive matches
      if (lastMatchIndex === ti - 1) score += 2;
      // Bonus for matching at word boundary
      if (ti === 0 || tLower[ti - 1] === '/' || tLower[ti - 1] === '-' || tLower[ti - 1] === '_') {
        score += 3;
      }
      lastMatchIndex = ti;
      pi++;
    }
  }

  // All pattern chars must match
  if (pi < pLower.length) return -1;

  // Bonus for shorter text (more precise match)
  score += Math.max(0, 20 - tLower.length);

  return score;
}

/**
 * Fuzzy filter: returns suggestions whose label or description
 * fuzzy-matches the query, sorted by score.
 */
function fuzzyFilter(suggestions: SuggestionItem[], query: string): SuggestionItem[] {
  if (!query) return suggestions.slice(0, 10);

  const scored = suggestions
    .map((s) => {
      const labelScore = fuzzyScore(query, s.label);
      const descScore = s.description ? fuzzyScore(query, s.description) * 0.5 : 0;
      const bestScore = Math.max(labelScore, descScore);
      return { suggestion: s, score: bestScore };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map((s) => s.suggestion);
}

// ── Hook ──────────────────────────────────────────────

export function useTypeahead() {
  const [state, setState] = useState<TypeaheadState>({
    visible: false,
    suggestions: [],
    focusIndex: 0,
    query: '',
    kind: 'none',
  });

  /**
   * Update suggestions for /slash commands.
   */
  const updateCommandSuggestions = useCallback(
    (input: string, commandSuggestions?: SuggestionItem[]) => {
      const source = commandSuggestions ?? BUILTIN_COMMAND_SUGGESTIONS;
      const filtered = fuzzyFilter(source, input);
      setState({
        visible: filtered.length > 0,
        suggestions: filtered,
        focusIndex: 0,
        query: input,
        kind: 'command',
      });
    },
    [],
  );

  /**
   * Update suggestions for @file references.
   */
  const updateFileSuggestions = useCallback(
    (query: string, fileSuggestions: SuggestionItem[]) => {
      const filtered = fuzzyFilter(fileSuggestions, query);
      setState({
        visible: filtered.length > 0,
        suggestions: filtered,
        focusIndex: 0,
        query,
        kind: 'file',
      });
    },
    [],
  );

  /**
   * Legacy: update suggestions based on current input.
   * Shows suggestions when input starts with "/" (slash commands).
   */
  const updateSuggestions = useCallback(
    (input: string, commandSuggestions?: SuggestionItem[]) => {
      if (input.startsWith('/')) {
        updateCommandSuggestions(input, commandSuggestions);
      } else {
        setState({
          visible: false,
          suggestions: [],
          focusIndex: 0,
          query: '',
          kind: 'none',
        });
      }
    },
    [updateCommandSuggestions],
  );

  /**
   * Move focus to the next suggestion.
   */
  const focusNext = useCallback(() => {
    setState((prev) => ({
      ...prev,
      focusIndex: (prev.focusIndex + 1) % prev.suggestions.length,
    }));
  }, []);

  /**
   * Move focus to the previous suggestion.
   */
  const focusPrev = useCallback(() => {
    setState((prev) => ({
      ...prev,
      focusIndex:
        prev.focusIndex > 0
          ? prev.focusIndex - 1
          : prev.suggestions.length - 1,
    }));
  }, []);

  /**
   * Accept the currently focused suggestion.
   * Returns the completed input string.
   */
  const acceptSuggestion = useCallback((): string | undefined => {
    if (!state.visible || state.suggestions.length === 0) return undefined;
    const suggestion = state.suggestions[state.focusIndex];
    setState({
      visible: false,
      suggestions: [],
      focusIndex: 0,
      query: '',
      kind: 'none',
    });
    return suggestion.value;
  }, [state]);

  /**
   * Dismiss suggestions without accepting.
   */
  const dismiss = useCallback(() => {
    setState({
      visible: false,
      suggestions: [],
      focusIndex: 0,
      query: '',
      kind: 'none',
    });
  }, []);

  /**
   * Get the currently focused suggestion.
   */
  const focusedSuggestion = useMemo(() => {
    if (!state.visible || state.suggestions.length === 0) return undefined;
    return state.suggestions[state.focusIndex];
  }, [state]);

  return {
    ...state,
    focusedSuggestion,
    updateSuggestions,
    updateCommandSuggestions,
    updateFileSuggestions,
    focusNext,
    focusPrev,
    acceptSuggestion,
    dismiss,
  };
}
