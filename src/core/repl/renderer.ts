/**
 * REPL renderer selection (Claude Code–aligned).
 *
 * - default: main terminal buffer + native scrollback
 * - fullscreen: alternate screen + Ink in-app scroll/search
 *
 * Priority: explicit CLI/options > persisted config > environment > default
 */

import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';

export type RendererMode = 'default' | 'fullscreen';

export interface RendererShellOptions {
  /** Explicit renderer from `--renderer` or `/tui`. */
  renderer?: RendererMode;
  /** `--fullscreen` */
  fullscreen?: boolean;
  /** Deprecated: `--ink` */
  ink?: boolean;
  /** Deprecated: `--no-ink` */
  noInk?: boolean;
  /** From `ui.renderer` in merged config. */
  configRenderer?: RendererMode;
}

/**
 * Force classic main-screen renderer (Claude: CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN).
 */
export function isDefaultRendererForcedByEnv(): boolean {
  const disable =
    process.env.SPARK_CLI_DISABLE_ALTERNATE_SCREEN ?? process.env.SPARK_CLI_NO_ALT_SCREEN;
  if (disable === '1' || disable === 'true') return true;
  return false;
}

/** Renderer preference from environment only (no CLI/config). */
export function resolveRendererFromEnv(): RendererMode | undefined {
  if (isDefaultRendererForcedByEnv()) return 'default';

  const named = process.env.SPARK_CLI_RENDERER;
  if (named === 'fullscreen' || named === 'default') return named;

  if (process.env.SPARK_CLI_FULLSCREEN === '1' || process.env.SPARK_CLI_FULLSCREEN === 'true') {
    return 'fullscreen';
  }

  // Legacy opt-in
  if (process.env.SPARK_CLI_INK === '1') return 'fullscreen';

  // Claude Code: NO_FLICKER=1 enables fullscreen alt-screen renderer
  if (isFullscreenEnvEnabled()) return 'fullscreen';

  return undefined;
}

/**
 * Resolve active renderer. Default is always `default` (main screen).
 */
export function resolveRenderer(opts: RendererShellOptions = {}): RendererMode {
  if (opts.renderer === 'fullscreen') return 'fullscreen';
  if (opts.renderer === 'default') return 'default';
  if (opts.fullscreen === true) return 'fullscreen';
  if (opts.fullscreen === false) return 'default';
  if (opts.ink === true) return 'fullscreen';
  if (opts.ink === false) return 'default';
  if (opts.noInk) return 'default';

  if (opts.configRenderer === 'fullscreen') return 'fullscreen';
  if (opts.configRenderer === 'default') return 'default';

  return resolveRendererFromEnv() ?? 'default';
}

/** @deprecated use resolveRenderer; kept for existing call sites. */
export function shouldUseFullscreenRenderer(opts: RendererShellOptions = {}): boolean {
  return resolveRenderer(opts) === 'fullscreen';
}

/** @deprecated alias */
export const shouldUseInkShell = shouldUseFullscreenRenderer;
