/**
 * Skills registry.
 *
 * Skills are folder-based context packs:
 *   `<projectRoot>/.spark-cli/skills/<name>/SKILL.md`
 *
 * Each skill has YAML-ish frontmatter (`name`, `description`, `triggers`,
 * `allowedTools`) plus a markdown body. The agent system prompt scans for
 * triggers in user input and inlines matched skill bodies; the model can also
 * call the `load_skill` tool to pull a specific one in mid-turn.
 *
 * The registry stays in-memory per session. `loadSkillsFromDisk` reads from
 * the project; sub-agents inherit the parent registry.
 */

export interface Skill {
  name: string;
  description?: string;
  body: string;
  triggers: string[];
  /** Optional regex pattern for richer matching. */
  triggerPattern?: RegExp;
  /** Tools this skill widens the registry with when loaded. */
  allowedTools?: string[];
}

export interface SkillRegistry {
  register(skill: Skill): void;
  get(name: string): Skill | undefined;
  list(): Skill[];
  /** Returns skills whose triggers match the user input (case-insensitive). */
  findByTrigger(text: string): Skill[];
}

export function createSkillRegistry(): SkillRegistry {
  const skills = new Map<string, Skill>();

  return {
    register(skill) {
      skills.set(skill.name.toLowerCase(), skill);
    },
    get(name) {
      return skills.get(name.toLowerCase());
    },
    list() {
      return [...skills.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
    findByTrigger(text) {
      const lower = text.toLowerCase();
      const out: Skill[] = [];
      for (const s of skills.values()) {
        let matched = false;
        for (const t of s.triggers) {
          if (t && lower.includes(t.toLowerCase())) {
            matched = true;
            break;
          }
        }
        if (!matched && s.triggerPattern && s.triggerPattern.test(text)) {
          matched = true;
        }
        if (matched) out.push(s);
      }
      return out;
    },
  };
}
