import type { SparkCLIConfig } from '../../config/schema.js';
import type { ResolvedModel } from './router.js';

export const DEFAULT_CONTEXT_BUDGET = 32000;

function inferKnownContextWindow(resolved: ResolvedModel): number | undefined {
  const provider = resolved.providerId.toLowerCase();
  const model = resolved.model.toLowerCase();

  // MiniMax official docs currently list MiniMax-M2.5 / M2.5-highspeed /
  // M2.7 / M2.7-highspeed with a 204,800-token context window.
  if (
    provider === 'mimo' ||
    provider === 'minimax' ||
    model.includes('mimo-v2.5') ||
    model.includes('minimax-m2.5') ||
    model.includes('m2.5') ||
    model.includes('m2.7')
  ) {
    return 204800;
  }

  return undefined;
}

export function resolveContextBudget(
  config: SparkCLIConfig,
  resolved: ResolvedModel,
): number {
  const configured = config.context?.maxTokens;
  if (typeof configured === 'number' && configured > 0 && configured !== DEFAULT_CONTEXT_BUDGET) {
    return configured;
  }

  return inferKnownContextWindow(resolved) ?? configured ?? DEFAULT_CONTEXT_BUDGET;
}
