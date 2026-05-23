/**
 * Spinner verb constants — maps tool/operation names to
 * human-readable verbs for the SpinnerWithVerb component.
 *
 * When a tool is active, the spinner shows a dynamic verb
 * (e.g., "Reading file.txt" instead of just "Thinking...").
 */

export type SpinnerVerb = string;

/**
 * Map tool identifiers to display verbs.
 */
export const TOOL_VERB_MAP: Record<string, SpinnerVerb> = {
  read_file: 'Reading',
  write_file: 'Writing',
  edit_file: 'Editing',
  create_file: 'Creating',
  delete_file: 'Deleting',
  search_files: 'Searching',
  list_directory: 'Listing',
  run_command: 'Running',
  bash: 'Running',
  shell: 'Executing',
  web_search: 'Searching',
  web_fetch: 'Fetching',
  analyze: 'Analyzing',
  plan: 'Planning',
  validate: 'Validating',
  build: 'Building',
  compile: 'Compiling',
  test: 'Testing',
  deploy: 'Deploying',
  diff: 'Comparing',
  apply: 'Applying',
  revert: 'Reverting',
};

/**
 * Map slash commands to display verbs.
 */
export const COMMAND_VERB_MAP: Record<string, SpinnerVerb> = {
  '/model': 'Loading models',
  '/theme': 'Loading themes',
  '/doctor': 'Running diagnostics',
  '/apply': 'Applying changes',
  '/revert': 'Reverting changes',
  '/diff': 'Computing diff',
};

/**
 * Default verb when no specific mapping is found.
 */
export const DEFAULT_VERB: SpinnerVerb = 'Thinking';

/**
 * Get the display verb for a tool or operation.
 *
 * @param identifier - Tool name or command identifier
 * @returns The display verb string
 */
export function getVerbForTool(identifier: string): SpinnerVerb {
  const normalized = identifier.toLowerCase().replace(/[-_]/g, '_');

  // Check exact match
  if (TOOL_VERB_MAP[normalized]) {
    return TOOL_VERB_MAP[normalized];
  }

  // Check prefix match (for tool names like "read_file(path)")
  for (const [key, verb] of Object.entries(TOOL_VERB_MAP)) {
    if (normalized.startsWith(key)) {
      return verb;
    }
  }

  // Check command map
  if (COMMAND_VERB_MAP[identifier]) {
    return COMMAND_VERB_MAP[identifier];
  }

  return DEFAULT_VERB;
}
