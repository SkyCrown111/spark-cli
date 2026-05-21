/**
 * Messages components
 * Components for displaying chat messages in the REPL
 */

export { Messages } from './Messages.js';
export type { MessagesProps } from './Messages.js';

export { UserMessage } from './UserMessage.js';
export type { UserMessageProps } from './UserMessage.js';

export { AssistantMessage } from './AssistantMessage.js';
export type { AssistantMessageProps } from './AssistantMessage.js';

export { ToolMessage } from './ToolMessage.js';
export type { ToolMessageProps } from './ToolMessage.js';

export { AssistantThinkingMessage } from './AssistantThinkingMessage.js';
export type { AssistantThinkingMessageProps } from './AssistantThinkingMessage.js';

export { ProgressMessage } from './ProgressMessage.js';
export type { ProgressMessageProps } from './ProgressMessage.js';

export { MarkdownRenderer } from './MarkdownRenderer.js';

// UserToolResultMessage — 7-state tool result routing
export { UserToolResultMessage } from './UserToolResultMessage/UserToolResultMessage.js';
export type { UserToolResultMessageProps } from './UserToolResultMessage/UserToolResultMessage.js';
export { UserToolSuccessMessage } from './UserToolResultMessage/UserToolSuccessMessage.js';
export { UserToolErrorMessage } from './UserToolResultMessage/UserToolErrorMessage.js';
export { UserToolRejectMessage } from './UserToolResultMessage/UserToolRejectMessage.js';
export { UserToolCanceledMessage } from './UserToolResultMessage/UserToolCanceledMessage.js';

// UserImageMessage — pasted image reference display
export { UserImageMessage } from './UserImageMessage.js';
export type { UserImageMessageProps } from './UserImageMessage.js';

// GroupedToolUseContent — groups consecutive tool calls
export { GroupedToolUseContent, groupConsecutiveTools } from './GroupedToolUseContent.js';
export type { GroupedToolUseContentProps, ToolGroup } from './GroupedToolUseContent.js';

// CompactBoundaryMessage — history compaction boundary
export { CompactBoundaryMessage } from './CompactBoundaryMessage.js';
export type { CompactBoundaryMessageProps } from './CompactBoundaryMessage.js';

// RateLimitMessage — API rate limit warning
export { RateLimitMessage } from './RateLimitMessage.js';
export type { RateLimitMessageProps } from './RateLimitMessage.js';

// HookProgressMessage — hook execution progress
export { HookProgressMessage } from './HookProgressMessage.js';
export type { HookProgressMessageProps } from './HookProgressMessage.js';

// PlanApprovalMessage — plan mode approval request
export { PlanApprovalMessage } from './PlanApprovalMessage.js';
export type { PlanApprovalMessageProps } from './PlanApprovalMessage.js';
