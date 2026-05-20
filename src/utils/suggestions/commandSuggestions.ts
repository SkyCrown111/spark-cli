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
 * Filter suggestions based on user input.
 *
 * If input starts with "/", filters by command name.
 * Returns matching suggestions sorted by relevance.
 */
export function filterSuggestions(
  suggestions: SuggestionItem[],
  input: string,
): SuggestionItem[] {
  if (!input) return suggestions.slice(0, 10);

  const lower = input.toLowerCase();

  return suggestions
    .filter((s) => {
      const labelLower = s.label.toLowerCase();
      const descLower = (s.description ?? '').toLowerCase();
      return labelLower.includes(lower) || descLower.includes(lower);
    })
    .sort((a, b) => {
      // Prioritize prefix matches
      const aPrefix = a.label.toLowerCase().startsWith(lower) ? 0 : 1;
      const bPrefix = b.label.toLowerCase().startsWith(lower) ? 0 : 1;
      return aPrefix - bPrefix;
    })
    .slice(0, 10);
}

/**
 * Built-in command suggestions (fallback when no registry is available).
 */
export const BUILTIN_COMMAND_SUGGESTIONS: SuggestionItem[] = [
  { value: '/help',  label: '/help',  description: 'Show available commands', category: 'command' },
  { value: '/model', label: '/model', description: 'Show or change AI model', category: 'command' },
  { value: '/clear', label: '/clear', description: 'Clear conversation history', category: 'command' },
  { value: '/exit',  label: '/exit',  description: 'Exit the REPL', category: 'command' },
  { value: '/quit',  label: '/quit',  description: 'Exit the REPL', category: 'command' },
  { value: '/plan',  label: '/plan',  description: 'Enter plan mode', category: 'command' },
  { value: '/auto',  label: '/auto',  description: 'Toggle auto-apply mode', category: 'command' },
  { value: '/diff',  label: '/diff',  description: 'Show staging diff', category: 'command' },
  { value: '/apply', label: '/apply', description: 'Apply staged changes', category: 'command' },
  { value: '/revert',label: '/revert',description: 'Revert staged changes', category: 'command' },
  { value: '/theme', label: '/theme', description: 'Change color theme', category: 'command' },
  { value: '/doctor',label: '/doctor',description: 'Run diagnostics', category: 'command' },
];