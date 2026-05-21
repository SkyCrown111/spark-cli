/**
 * UserToolResultMessage — routes tool results to the appropriate
 * sub-component based on the result state.
 *
 * States:
 * 1. Success — normal tool result → UserToolSuccessMessage
 * 2. Error — is_error flag → UserToolErrorMessage
 * 3. Reject — [REJECTED] prefix → UserToolRejectMessage
 * 4. Canceled — [CANCELLED] prefix → UserToolCanceledMessage
 * 5. RejectedPlan — [PLAN_REJECTED] prefix → UserToolRejectMessage (with plan label)
 * 6. RejectedToolUse — [TOOL_REJECTED] prefix → UserToolRejectMessage (with tool label)
 * 7. Fallback — unrecognized → UserToolSuccessMessage (generic display)
 *
 * Mirrors cc-haha's UserToolResultMessage routing pattern.
 */

import React from 'react';
import { Box } from '../../design-system/Box.js';
import { Text } from '../../design-system/Text.js';
import type { ToolMessage as ToolMessageType } from '../../../core/providers/openai-compatible.js';
import { routeToolResult } from './utils.js';
import { UserToolSuccessMessage } from './UserToolSuccessMessage.js';
import { UserToolErrorMessage } from './UserToolErrorMessage.js';
import { UserToolRejectMessage } from './UserToolRejectMessage.js';
import { UserToolCanceledMessage } from './UserToolCanceledMessage.js';

export interface UserToolResultMessageProps {
  message: ToolMessageType;
  /** Whether to show expanded (override collapse) */
  expanded?: boolean;
}

/**
 * Extract a readable tool label from tool_call_id.
 */
function getToolLabel(toolCallId: string | undefined): string {
  if (!toolCallId) return 'Tool';
  if (toolCallId.startsWith('call_')) return 'Tool';
  return toolCallId;
}

export const UserToolResultMessage: React.FC<UserToolResultMessageProps> = ({
  message,
  expanded = false,
}) => {
  const content = message.content;
  const toolLabel = getToolLabel(message.tool_call_id);
  const route = routeToolResult(content);

  switch (route.state) {
    case 'error':
      return <UserToolErrorMessage toolLabel={toolLabel} content={route.cleanContent} />;

    case 'reject':
      return <UserToolRejectMessage toolLabel={toolLabel} content={route.cleanContent} />;

    case 'canceled':
      return <UserToolCanceledMessage toolLabel={toolLabel} content={route.cleanContent} />;

    case 'rejected-plan':
      return <UserToolRejectMessage toolLabel={`${toolLabel} (plan)`} content={route.cleanContent} />;

    case 'rejected-tool-use':
      return <UserToolRejectMessage toolLabel={`${toolLabel} (tool)`} content={route.cleanContent} />;

    case 'success':
      return <UserToolSuccessMessage toolLabel={toolLabel} content={route.cleanContent} expanded={expanded} />;

    case 'fallback':
    default:
      return (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text bold color="gray">? {toolLabel}</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text dimColor wrap="wrap">{content}</Text>
          </Box>
        </Box>
      );
  }
};
