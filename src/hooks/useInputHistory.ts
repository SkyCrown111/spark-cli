/**
 * useInputHistory hook - Input history management
 * Manages command history with navigation (up/down arrows)
 */

import { useState, useCallback } from 'react';

export interface UseInputHistoryOptions {
  /** Initial history entries */
  initialHistory?: string[];
  /** Maximum number of history entries to keep (default: 100) */
  maxHistory?: number;
  /** Whether to persist history to storage */
  persist?: boolean;
  /** Storage key for persistence (default: 'spark-cli-history') */
  storageKey?: string;
}

export interface UseInputHistoryReturn {
  /** Current history entries (newest first) */
  history: string[];
  /** Current history navigation index (-1 means not navigating) */
  historyIndex: number;
  /** Add a new entry to history */
  addToHistory: (entry: string) => void;
  /** Navigate up in history (older entries) */
  navigateUp: () => string | undefined;
  /** Navigate down in history (newer entries) */
  navigateDown: () => string | undefined;
  /** Reset navigation to current input */
  resetNavigation: () => void;
  /** Clear all history */
  clearHistory: () => void;
  /** Get entry at current navigation index */
  getCurrentEntry: () => string | undefined;
}

/**
 * Hook to manage input history with navigation
 * 
 * Provides command history functionality similar to bash/zsh,
 * with up/down arrow navigation and automatic deduplication.
 * 
 * @param options - Configuration options
 * @returns History state and management functions
 * 
 * @example
 * ```tsx
 * const { 
 *   history, 
 *   addToHistory, 
 *   navigateUp, 
 *   navigateDown,
 *   getCurrentEntry 
 * } = useInputHistory({
 *   maxHistory: 100
 * });
 * 
 * // Add command to history
 * addToHistory('spark-cli gen player');
 * 
 * // Navigate history
 * const previousCommand = navigateUp();
 * const nextCommand = navigateDown();
 * 
 * // Get current entry
 * const current = getCurrentEntry();
 * ```
 */
export const useInputHistory = ({
  initialHistory = [],
  maxHistory = 100,
  persist = false,
  storageKey = 'spark-cli-history',
}: UseInputHistoryOptions = {}): UseInputHistoryReturn => {
  // Load initial history from storage if persistence is enabled
  const loadInitialHistory = (): string[] => {
    if (persist && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        // Ignore storage errors
      }
    }
    return initialHistory;
  };

  const [history, setHistory] = useState<string[]>(loadInitialHistory());
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  /**
   * Save history to storage if persistence is enabled
   */
  const saveHistory = useCallback((newHistory: string[]) => {
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newHistory));
      } catch (error) {
        // Ignore storage errors
      }
    }
  }, [persist, storageKey]);

  /**
   * Add a new entry to history
   * Deduplicates consecutive identical entries
   */
  const addToHistory = useCallback((entry: string) => {
    const trimmed = entry.trim();
    
    // Don't add empty entries
    if (!trimmed) {
      return;
    }

    setHistory(prev => {
      // Don't add if it's the same as the most recent entry
      if (prev.length > 0 && prev[0] === trimmed) {
        return prev;
      }

      // Add to front (newest first)
      const newHistory = [trimmed, ...prev];
      
      // Trim to max length
      const trimmedHistory = newHistory.slice(0, maxHistory);
      
      // Save to storage
      saveHistory(trimmedHistory);
      
      return trimmedHistory;
    });

    // Reset navigation
    setHistoryIndex(-1);
  }, [maxHistory, saveHistory]);

  /**
   * Navigate up in history (to older entries)
   * Returns the entry at the new position
   */
  const navigateUp = useCallback((): string | undefined => {
    if (history.length === 0) {
      return undefined;
    }

    setHistoryIndex(prev => {
      const newIndex = prev < history.length - 1 ? prev + 1 : prev;
      return newIndex;
    });

    const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
    return history[newIndex];
  }, [history, historyIndex]);

  /**
   * Navigate down in history (to newer entries)
   * Returns the entry at the new position, or undefined if at current input
   */
  const navigateDown = useCallback((): string | undefined => {
    if (historyIndex <= 0) {
      setHistoryIndex(-1);
      return undefined;
    }

    setHistoryIndex(prev => prev - 1);
    
    const newIndex = historyIndex - 1;
    return newIndex >= 0 ? history[newIndex] : undefined;
  }, [history, historyIndex]);

  /**
   * Reset navigation to current input (not in history)
   */
  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        // Ignore storage errors
      }
    }
  }, [persist, storageKey]);

  /**
   * Get the entry at the current navigation index
   */
  const getCurrentEntry = useCallback((): string | undefined => {
    if (historyIndex < 0 || historyIndex >= history.length) {
      return undefined;
    }
    return history[historyIndex];
  }, [history, historyIndex]);

  return {
    history,
    historyIndex,
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    clearHistory,
    getCurrentEntry,
  };
};
