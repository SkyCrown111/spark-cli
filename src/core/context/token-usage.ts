/**
 * REPL status-line token usage: map provider usage + history → used/budget.
 *
 * Context-window fill is the **input** size on the last provider call
 * (`prompt_tokens`), not the sum across tool iterations (each call already
 * includes the full history). When the API omits usage, fall back to
 * `estimateTokens(history)`.
 */

import type { ChatMessage } from '../providers/openai-compatible.js';
import type { ResolvedModel } from '../providers/router.js';
import type { SparkCLIConfig } from '../../config/schema.js';
import { resolveContextBudget } from '../providers/model-context.js';
import { estimateTokens } from './token-budget.js';

export interface TokenUsageSnapshot {
  used: number;
  budget: number;
}

export function resolveContextUsageSnapshot(
  history: ChatMessage[],
  budget: number,
  providerUsage?: { prompt_tokens?: number; completion_tokens?: number },
): TokenUsageSnapshot {
  const fromApi =
    typeof providerUsage?.prompt_tokens === 'number' && providerUsage.prompt_tokens > 0
      ? providerUsage.prompt_tokens
      : undefined;
  const used = fromApi ?? estimateTokens(history);
  return { used, budget };
}

export function buildTokenUsageSnapshot(
  config: SparkCLIConfig,
  resolved: ResolvedModel,
  history: ChatMessage[],
  providerUsage?: { prompt_tokens?: number; completion_tokens?: number },
): TokenUsageSnapshot {
  const budget = resolveContextBudget(config, resolved);
  return resolveContextUsageSnapshot(history, budget, providerUsage);
}
