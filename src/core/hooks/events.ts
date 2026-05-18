/**
 * Hook event taxonomy.
 *
 * Hooks are user-supplied scripts that fire on session, user-message,
 * assistant-message, tool, and apply boundaries. Two events are *blocking*:
 * `pre_tool` and `before_apply` — a non-zero hook exit aborts the tool call
 * (or apply) with the hook's stderr surfaced as the block reason.
 *
 * Payload shapes are stable JSON the hook reads from stdin. Keep them
 * additive — old hooks must keep working when fields are added.
 */
export type HookEvent =
  | 'session_start'
  | 'session_end'
  | 'pre_user_message'
  | 'post_assistant_message'
  | 'pre_tool'
  | 'post_tool'
  | 'before_apply'
  | 'on_skill_load'
  | 'on_compaction'
  | 'on_subagent_spawn'
  | 'on_plan_enter'
  | 'on_plan_exit';

export const BLOCKING_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
  'pre_tool',
  'before_apply',
]);

export interface SessionStartPayload {
  event: 'session_start';
  projectRoot: string;
  writeMode: 'staging' | 'direct';
  startedAt: string;
}

export interface SessionEndPayload {
  event: 'session_end';
  projectRoot: string;
  endedAt: string;
}

export interface UserMessagePayload {
  event: 'pre_user_message';
  projectRoot: string;
  text: string;
  mode: 'normal' | 'plan';
}

export interface AssistantMessagePayload {
  event: 'post_assistant_message';
  projectRoot: string;
  text: string;
  iterations: number;
  toolCalls: number;
}

export interface PreToolPayload {
  event: 'pre_tool';
  projectRoot: string;
  tool: string;
  args: string;
  agentId: string;
  writeMode: 'staging' | 'direct';
}

export interface PostToolPayload {
  event: 'post_tool';
  projectRoot: string;
  tool: string;
  args: string;
  agentId: string;
  durationMs: number;
  isError: boolean;
}

export interface BeforeApplyPayload {
  event: 'before_apply';
  projectRoot: string;
  files: Array<{ path: string; action: 'create' | 'modify' | 'delete' }>;
}

export interface SkillLoadPayload {
  event: 'on_skill_load';
  projectRoot: string;
  agentId: string;
  name: string;
  allowedTools: string[];
}

export interface CompactionPayload {
  event: 'on_compaction';
  projectRoot: string;
  agentId: string;
  before: number;
  after: number;
  compactedCount: number;
  reason: 'threshold' | 'hard_cap' | 'manual';
}

export interface SubagentSpawnPayload {
  event: 'on_subagent_spawn';
  projectRoot: string;
  agentId: string;
  parentAgentId: string;
  depth: number;
  tools: string[];
  promptPreview: string;
}

export interface PlanEnterPayload {
  event: 'on_plan_enter';
  projectRoot: string;
}

export interface PlanExitPayload {
  event: 'on_plan_exit';
  projectRoot: string;
  approved: boolean;
}

export type HookPayload =
  | SessionStartPayload
  | SessionEndPayload
  | UserMessagePayload
  | AssistantMessagePayload
  | PreToolPayload
  | PostToolPayload
  | BeforeApplyPayload
  | SkillLoadPayload
  | CompactionPayload
  | SubagentSpawnPayload
  | PlanEnterPayload
  | PlanExitPayload;
