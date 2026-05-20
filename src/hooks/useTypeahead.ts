/**
 * useTypeahead — hook for managing autocomplete/typeahead behavior.
 *
 * Provides suggestion filtering, selection cycling, and
 * completion insertion logic for the PromptInput component.
 */

import { useState, useCallback, useMemo } from 'react';
import { filterSuggestions, BUILTIN_COMMAND_SUGGESTIONS, type SuggestionItem } from '../utils/suggestions/commandSuggestions.js';

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
}

// ── Hook ──────────────────────────────────────────────

export function useTypeahead() {
  const [state, setState] = useState<TypeaheadState>({
    visible: false,
    suggestions: [],
    focusIndex: 0,
    query: '',
  });

  /**
   * Update suggestions based on current input.
   * Shows suggestions when input starts with "/" (slash commands).
   */
  const updateSuggestions = useCallback((input: string) => {
    if (input.startsWith('/')) {
      const filtered = filterSuggestions(BUILTIN_COMMAND_SUGGESTIONS, input);
      setState({
        visible: filtered.length > 0,
        suggestions: filtered,
        focusIndex: 0,
        query: input,
      });
    } else {
      setState({
        visible: false,
        suggestions: [],
        focusIndex: 0,
        query: '',
      });
    }
  }, []);

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
    focusNext,
    focusPrev,
    acceptSuggestion,
    dismiss,
  };
}