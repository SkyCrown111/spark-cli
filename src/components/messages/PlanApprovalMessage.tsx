/**
 * PlanApprovalMessage — displays a plan mode approval request.
 *
 * In plan mode, the agent presents its plan and asks the user
 * to approve before executing. This component renders the
 * plan summary with approve/reject options.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface PlanApprovalMessageProps {
  /** The plan summary text */
  planSummary: string;
  /** Number of steps in the plan */
  stepCount?: number;
  /** Whether approval is pending */
  pending?: boolean;
  /** Callback to approve the plan */
  onApprove?: () => void;
  /** Callback to reject the plan */
  onReject?: () => void;
}

export const PlanApprovalMessage: React.FC<PlanApprovalMessageProps> = ({
  planSummary,
  stepCount,
  pending = true,
}) => {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text color="magenta" bold>
          {'>'} Plan
        </Text>
        {stepCount !== undefined && <Text dimColor>({stepCount} steps)</Text>}
      </Box>
      <Box paddingLeft={2}>
        <Text wrap="wrap">{planSummary}</Text>
      </Box>
      {pending && (
        <Box paddingLeft={2} marginTop={1}>
          <Text dimColor>
            Press <Text bold>y</Text> to approve · <Text bold>n</Text> to reject ·{' '}
            <Text bold>e</Text> to edit
          </Text>
        </Box>
      )}
    </Box>
  );
};
