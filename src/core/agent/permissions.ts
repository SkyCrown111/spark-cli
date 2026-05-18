/**
 * Per-tool permission gate. Centralizes plan-mode read-only enforcement and
 * mode-based mutation gating so plan mode can't be bypassed via MCP-adapted
 * tools (single-source check; absorbs `isMcpWriteAllowed`).
 */

import type { SparkCLIConfig } from '../../config/schema.js';
import type { ToolRunMode, ToolWriteMode } from './tool-registry.js';

export interface PermissionInput {
  toolName: string;
  mutates: boolean;
  planModeAllowed: boolean;
  mode: ToolRunMode;
  writeMode: ToolWriteMode;
  config: SparkCLIConfig;
  /**
   * Tools that have been dynamically widened by skills loaded this session.
   * When non-empty, write/non-plan-mode-allowed tools require either
   *   - membership in this set (skill explicitly granted it), OR
   *   - the default permission to apply.
   * Skills can WIDEN, never RESTRICT.
   */
  skillAllowedTools?: ReadonlySet<string>;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * MCP write tools (mirror of `*_TOOLS.write` packs in `src/mcp/tools.ts`).
 * Used to gate MCP-adapted tools by both `mcp.allowWrite` AND plan mode.
 *
 * Keep in sync with the actual tool names registered in `src/mcp/tools.ts`.
 * The previous list referenced a non-existent `scene_update_component`; the
 * real name is `component_update`.
 */
const MCP_WRITE_TOOL_NAMES = new Set<string>([
  'scene_add_node',
  'component_update',
  'stage_project_file',
]);

export function isMcpWriteToolName(name: string): boolean {
  return MCP_WRITE_TOOL_NAMES.has(name);
}

export function isToolAllowed(input: PermissionInput): PermissionResult {
  const skillGranted = input.skillAllowedTools?.has(input.toolName) ?? false;

  // Plan mode: only `planModeAllowed` tools survive UNLESS a loaded skill
  // explicitly grants this tool. This keeps the "skills WIDEN, not restrict"
  // contract — a skill can authorize, e.g., write_file inside a plan-mode
  // workflow without disabling plan mode globally.
  if (input.mode === 'plan' && !input.planModeAllowed && !skillGranted) {
    return {
      allowed: false,
      reason: `Plan mode (read-only): ${input.toolName} is not allowed. Use /exit-plan to apply changes.`,
    };
  }

  // MCP-adapted write tools require `mcp.allowWrite: true`. This was previously
  // checked only inside `src/mcp/tools.ts`; absorbing it here makes the gate
  // uniform across in-process and MCP-driven calls.
  if (input.mutates && isMcpWriteToolName(input.toolName)) {
    if (input.config.mcp?.allowWrite !== true && !skillGranted) {
      return {
        allowed: false,
        reason:
          `MCP write tool "${input.toolName}" is disabled. ` +
          'Set mcp.allowWrite: true in spark-cli.config.yaml.',
      };
    }
  }

  return { allowed: true };
}
