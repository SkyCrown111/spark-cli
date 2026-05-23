/**
 * Command suggestions — data source for /slash command autocomplete.
 *
 * Provides a list of available slash commands that can be
 * filtered and displayed in the typeahead UI.
 */

import type { SlashRegistry } from '../../core/slash/registry.js';

export interface SuggestionItem {
  /** Unique value for this suggestion */
  value: string;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Category for grouping */
  category?: string;
}

/**
 * Get slash command suggestions from the registry.
 *
 * Returns all registered commands formatted as suggestion items.
 */
export function getCommandSuggestions(registry: SlashRegistry): SuggestionItem[] {
  const commands = registry.list();
  return commands.map((cmd) => ({
    value: `/${cmd.name}`,
    label: `/${cmd.name}`,
    description: cmd.description,
    category: 'command',
  }));
}

/**
 * Fuzzy match: checks if all characters of `pattern` appear
 * in `text` in order. Returns a score or -1 for no match.
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
      if (lastMatchIndex === ti - 1) score += 2; // consecutive bonus
      if (ti === 0 || tLower[ti - 1] === '/' || tLower[ti - 1] === '-') score += 3; // word boundary bonus
      lastMatchIndex = ti;
      pi++;
    }
  }

  if (pi < pLower.length) return -1;
  score += Math.max(0, 20 - tLower.length); // shorter = better
  return score;
}

/**
 * Filter suggestions based on user input.
 *
 * Uses fuzzy matching: characters must appear in order but
 * don't need to be contiguous. Prefix and word-boundary
 * matches score higher.
 */
export function filterSuggestions(suggestions: SuggestionItem[], input: string): SuggestionItem[] {
  if (!input) return suggestions.slice(0, 10);

  // Strip leading / for matching
  const query = input.startsWith('/') ? input.slice(1) : input;

  if (!query) return suggestions.slice(0, 10);

  return suggestions
    .map((s) => {
      const label = s.label.startsWith('/') ? s.label.slice(1) : s.label;
      const labelScore = fuzzyScore(query, label);
      const descScore = s.description ? fuzzyScore(query, s.description) * 0.5 : 0;
      return { suggestion: s, score: Math.max(labelScore, descScore) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => s.suggestion);
}

/**
 * Built-in command suggestions (fallback when no registry is available).
 */
export const BUILTIN_COMMAND_SUGGESTIONS: SuggestionItem[] = [
  { value: '/help', label: '/help', description: 'Show available commands', category: 'command' },
  { value: '/model', label: '/model', description: 'Show or change AI model', category: 'command' },
  {
    value: '/clear',
    label: '/clear',
    description: 'Clear conversation history',
    category: 'command',
  },
  { value: '/exit', label: '/exit', description: 'Exit the REPL', category: 'command' },
  { value: '/quit', label: '/quit', description: 'Exit the REPL', category: 'command' },
  { value: '/plan', label: '/plan', description: 'Enter plan mode', category: 'command' },
  { value: '/auto', label: '/auto', description: 'Toggle auto-apply mode', category: 'command' },
  { value: '/diff', label: '/diff', description: 'Show staging diff', category: 'command' },
  { value: '/apply', label: '/apply', description: 'Apply staged changes', category: 'command' },
  { value: '/revert', label: '/revert', description: 'Revert staged changes', category: 'command' },
  { value: '/theme', label: '/theme', description: 'Change color theme', category: 'command' },
  { value: '/doctor', label: '/doctor', description: 'Run diagnostics', category: 'command' },
];
