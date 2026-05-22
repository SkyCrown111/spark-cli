/**
 * Custom agent definitions registry.
 *
 * Agents are folder-based configuration packs:
 *   `<projectRoot>/.spark-cli/agents/<name>/AGENT.md`
 *   `~/.spark-cli/agents/<name>/AGENT.md`
 *
 * Each agent has YAML-ish frontmatter (`name`, `description`, `allowedTools`,
 * `contextMode`) plus a markdown body that becomes the system prompt extension.
 *
 * The registry stays in-memory per session. `loadAgentsFromDisk` reads from
 * global and project dirs (project wins on duplicate names).
 */

export type AgentContextMode = 'inherit' | 'fresh' | 'fork';

export interface AgentDefinition {
  name: string;
  description?: string;
  /** Markdown body appended to the default system prompt. */
  systemPrompt: string;
  /** Tools this agent is restricted to (undefined = all tools). */
  allowedTools?: string[];
  /**
   * Context mode:
   * - `inherit` (default): agent shares the parent conversation history
   * - `fresh`: agent starts with an empty history (only system prompt)
   * - `fork`: agent gets a copy of the parent history at spawn time
   */
  contextMode?: AgentContextMode;
  /** Source where this agent was loaded from. */
  source?: 'global' | 'project';
}

export interface AgentRegistry {
  register(agent: AgentDefinition): void;
  get(name: string): AgentDefinition | undefined;
  list(): AgentDefinition[];
  has(name: string): boolean;
}

export function createAgentRegistry(): AgentRegistry {
  const agents = new Map<string, AgentDefinition>();

  return {
    register(agent) {
      agents.set(agent.name.toLowerCase(), agent);
    },
    get(name) {
      return agents.get(name.toLowerCase());
    },
    list() {
      return [...agents.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
    has(name) {
      return agents.has(name.toLowerCase());
    },
  };
}
