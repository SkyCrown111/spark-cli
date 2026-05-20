import type { SparkCLIConfig } from '../../config/schema.js';
import type { ResolvedModel } from './router.js';

export const DEFAULT_CONTEXT_BUDGET = 32000;

/** DeepSeek V4 / V4-Flash official context window (1M tokens). */
export const DEEPSEEK_V4_CONTEXT_BUDGET = 1_000_000;

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

  // DeepSeek V4 family: 1M context (incl. baidu-routed deepseek-v4-*).
  if (model.includes('deepseek-v4') || model.includes('deepseek_v4')) {
    return DEEPSEEK_V4_CONTEXT_BUDGET;
  }

  // Older DeepSeek models (V3, chat, reasoner): 64k unless user overrides in config.
  if (
    provider === 'deepseek' ||
    model.includes('deepseek') ||
    (provider === 'baidu' && model.includes('deepseek'))
  ) {
    return 65536;
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
