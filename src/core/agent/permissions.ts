/**
 * Per-tool permission gate. Centralizes plan-mode read-only enforcement,
 * mode-based mutation gating, config-driven rules, protected paths, and
 * acceptEdits/dontAsk mode logic.
 *
 * Single-source check; absorbs `isMcpWriteAllowed`.
 */

import type { SparkCLIConfig } from '../../config/schema.js';
import type { PermissionMode } from '../../state/AppState.js';
import type { ToolRunMode, ToolWriteMode } from './tool-registry.js';
import { MCP_WRITE_TOOL_NAMES } from '../../mcp/tools.js';
import {
  evaluateRules,
  extractPathArgs,
  extractCommandArg,
  extractUrlArg,
  extractAgentName,
  type ToolRule,
} from './permission-rules.js';

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
  /** Current permission mode (default/plan/auto/acceptEdits/dontAsk/bypass). */
  permissionMode?: PermissionMode;
  /** Parsed tool arguments, used for path-based rule evaluation. */
  toolArgs?: Record<string, unknown>;
  /** Where this tool came from: 'builtin' or 'mcp-client'. */
  source?: 'builtin' | 'mcp-client';
  /** Tools explicitly denied by CLI --disallowedTools flag. */
  disallowedTools?: ReadonlySet<string>;
  /** Tools allowed by the active agent definition (restricts to this set). */
  agentAllowedTools?: ReadonlySet<string>;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  /** If 'ask', the tool should prompt the user even if it wouldn't normally. */
  askOverride?: boolean;
}

/**
 * MCP write tools: canonical set exported from `src/mcp/tools.ts` as
 * `MCP_WRITE_TOOL_NAMES` (built from `*_TOOLS.write` + `assets_fix`).
 * Used to gate MCP-adapted tools by both `mcp.allowWrite` AND plan mode.
 */

export function isMcpWriteToolName(name: string): boolean {
  return MCP_WRITE_TOOL_NAMES.has(name);
}

/** Tools that auto-approve in acceptEdits mode (file edits + common fs commands). */
export const EDIT_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'bash',
]);

/** Paths that are never auto-approved, even in acceptEdits/bypass mode. */
export const DEFAULT_PROTECTED_PATHS = [
  '.git',
  '.spark-cli',
  '.vscode',
  '.claude',
  '.kiro',
  '.husky',
  '.gitconfig',
];

/**
 * Check whether a target path falls under a protected directory.
 */
export function isProtectedPath(
  targetPath: string,
  protectedPaths: string[] = DEFAULT_PROTECTED_PATHS,
): boolean {
  // Normalize: strip leading ./ and force relative comparison
  const normalized = targetPath.replace(/^\.\//, '');
  return protectedPaths.some((pp) => normalized.startsWith(pp + '/') || normalized === pp);
}

/**
 * Evaluate config-driven permission rules and return their decision.
 */
function evaluateConfigRules(
  config: SparkCLIConfig,
  toolName: string,
  toolArgs?: Record<string, unknown>,
): 'deny' | 'ask' | 'allow' | undefined {
  const rules = config.security?.toolRules;
  if (!rules || rules.length === 0) return undefined;

  const pathArgs = toolArgs ? extractPathArgs(toolArgs) : [];
  const commandArg = toolArgs ? extractCommandArg(toolArgs) : undefined;
  const urlArg = toolArgs ? extractUrlArg(toolArgs) : undefined;
  const agentName = toolArgs ? extractAgentName(toolArgs) : undefined;
  return evaluateRules(rules as ToolRule[], toolName, pathArgs, commandArg, urlArg, agentName);
}

export function isToolAllowed(input: PermissionInput): PermissionResult {
  const skillGranted = input.skillAllowedTools?.has(input.toolName) ?? false;
  const permMode = input.permissionMode ?? 'default';

  // ── Bypass mode: everything allowed ──
  if (permMode === 'bypass') {
    return { allowed: true };
  }

  // ── CLI --disallowedTools: always deny ──
  if (input.disallowedTools?.has(input.toolName)) {
    return {
      allowed: false,
      reason: `Tool "${input.toolName}" is explicitly denied by --disallowedTools.`,
    };
  }

  // ── Agent allowedTools: restrict to agent's tool set ──
  if (input.agentAllowedTools && input.agentAllowedTools.size > 0) {
    if (!input.agentAllowedTools.has(input.toolName)) {
      return {
        allowed: false,
        reason: `Tool "${input.toolName}" is not in the active agent's allowed tools.`,
      };
    }
  }

  // ── Config-driven rules (highest precedence after bypass) ──
  const configDecision = evaluateConfigRules(input.config, input.toolName, input.toolArgs);
  if (configDecision === 'deny') {
    return {
      allowed: false,
      reason: `Config rule denies tool "${input.toolName}".`,
    };
  }
  if (configDecision === 'ask') {
    // Don't block outright, but force a confirmation prompt
    return { allowed: true, askOverride: true };
  }
  if (configDecision === 'allow') {
    // Config explicitly allows — skip all further checks
    return { allowed: true };
  }

  // ── Plan mode: only `planModeAllowed` tools survive ──
  if (permMode === 'plan' || input.mode === 'plan') {
    if (!input.planModeAllowed && !skillGranted) {
      return {
        allowed: false,
        reason: `Plan mode (read-only): ${input.toolName} is not allowed. Use /exit-plan to apply changes.`,
      };
    }
    return { allowed: true };
  }

  // ── dontAsk mode: only pre-approved tools survive ──
  if (permMode === 'dontAsk') {
    // Only tools in the "always allow" set or allowed by config rules are approved.
    // Everything else is auto-denied without prompting.
    // (config rules already evaluated above — if we're here, no config rule matched)
    return {
      allowed: false,
      reason: `dontAsk mode: ${input.toolName} is not in the allowed set. No config rule permits it.`,
    };
  }

  // ── acceptEdits mode: auto-approve read + file edits + common fs commands ──
  if (permMode === 'acceptEdits') {
    // Read-only tools are always allowed
    if (!input.mutates) {
      return { allowed: true };
    }
    // Edit tools are auto-approved unless they target a protected path
    if (EDIT_TOOL_NAMES.has(input.toolName)) {
      const pathArgs = input.toolArgs ? extractPathArgs(input.toolArgs) : [];
      const protectedPaths = input.config.security?.protectedPaths ?? DEFAULT_PROTECTED_PATHS;
      if (pathArgs.some((p) => isProtectedPath(p, protectedPaths))) {
        return {
          allowed: true, // allowed but force a prompt for protected paths
          askOverride: true,
        };
      }
      return { allowed: true };
    }
    // Other mutating tools (not in EDIT_TOOL_NAMES) still require confirmation
    return { allowed: true, askOverride: true };
  }

  // ── Default mode: MCP write gate ──
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

  // ── Default mode: MCP client write gate ──
  if (input.mutates && input.source === 'mcp-client') {
    if (input.config.mcp?.allowWrite !== true && !skillGranted) {
      return {
        allowed: false,
        reason:
          `MCP client write tool "${input.toolName}" is disabled. ` +
          'Set mcp.allowWrite: true in spark-cli.config.yaml.',
      };
    }
  }

  // ── Protected path check (default mode) ──
  if (input.mutates) {
    const pathArgs = input.toolArgs ? extractPathArgs(input.toolArgs) : [];
    const protectedPaths = input.config.security?.protectedPaths ?? DEFAULT_PROTECTED_PATHS;
    if (pathArgs.some((p) => isProtectedPath(p, protectedPaths))) {
      return { allowed: true, askOverride: true };
    }
  }

  return { allowed: true };
}