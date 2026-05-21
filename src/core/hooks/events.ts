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
  | 'on_plan_exit'
  | 'permission_request'
  | 'permission_denied'
  | 'stop'
  | 'stop_failure'
  | 'task_created'
  | 'task_completed'
  | 'pre_compact'
  | 'post_compact'
  | 'file_changed';

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

export interface PermissionRequestPayload {
  event: 'permission_request';
  projectRoot: string;
  tool: string;
  args: string;
  agentId: string;
}

export interface PermissionDeniedPayload {
  event: 'permission_denied';
  projectRoot: string;
  tool: string;
  args: string;
  agentId: string;
  reason: string;
}

export interface StopPayload {
  event: 'stop';
  projectRoot: string;
  agentId: string;
  stopReason: string;
  iterations: number;
}

export interface StopFailurePayload {
  event: 'stop_failure';
  projectRoot: string;
  agentId: string;
  error: string;
  iterations: number;
}

export interface TaskCreatedPayload {
  event: 'task_created';
  projectRoot: string;
  taskId: string;
  subject: string;
}

export interface TaskCompletedPayload {
  event: 'task_completed';
  projectRoot: string;
  taskId: string;
  subject: string;
}

export interface PreCompactPayload {
  event: 'pre_compact';
  projectRoot: string;
  agentId: string;
  messageCount: number;
  reason: 'threshold' | 'hard_cap' | 'manual';
}

export interface PostCompactPayload {
  event: 'post_compact';
  projectRoot: string;
  agentId: string;
  before: number;
  after: number;
  compactedCount: number;
  summary: string;
}

export interface FileChangedPayload {
  event: 'file_changed';
  projectRoot: string;
  path: string;
  action: 'create' | 'modify' | 'delete';
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
  | PlanExitPayload
  | PermissionRequestPayload
  | PermissionDeniedPayload
  | StopPayload
  | StopFailurePayload
  | TaskCreatedPayload
  | TaskCompletedPayload
  | PreCompactPayload
  | PostCompactPayload
  | FileChangedPayload;
