/**
 * bash: shell command tool, scoped to the project root.
 *
 * - 30s default timeout, capped at 5 minutes.
 * - cwd is always `projectRoot`. The model cannot escape via `cwd:` arg.
 * - On Windows, uses `shell:true` so common idioms work; SIGINT/abort uses
 *   `taskkill /F /T /PID <pid>` because `child.kill('SIGTERM')` is a no-op.
 * - Output is captured (stdout/stderr) and truncated to 32 KB combined; the
 *   model gets a tail marker so it can re-run with a narrower command.
 * - Carries `serial: true` semantics — the agent dispatcher avoids running
 *   two `bash` calls in parallel (both can step on each other in the same cwd).
 */

import { spawn } from 'node:child_process';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024;

function getTimeoutDefault(ctx: ToolContext): number {
  const t = ctx.config.tools?.bash?.timeoutMs;
  return typeof t === 'number' && t > 0 ? Math.min(t, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
}

function getMaxOutputBytes(ctx: ToolContext): number {
  const m = ctx.config.tools?.bash?.maxOutputBytes;
  return typeof m === 'number' && m > 0 ? m : DEFAULT_MAX_OUTPUT_BYTES;
}

function killTree(pid: number | undefined): void {
  if (typeof pid !== 'number') return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/F', '/T'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
}

interface RunOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  truncated: boolean;
  durationMs: number;
}

export async function runShell(
  command: string,
  opts: {
    cwd: string;
    timeoutMs: number;
    abortSignal?: AbortSignal;
    env?: Record<string, string>;
    maxOutputBytes?: number;
  },
): Promise<RunOutcome> {
  const start = Date.now();
  const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  return await new Promise<RunOutcome>((resolveOutcome) => {
    const child = spawn(command, {
      cwd: opts.cwd,
      shell: true,
      windowsHide: true,
      // detached on POSIX so we can kill the whole process group.
      detached: process.platform !== 'win32',
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let aborted = false;

    const append = (
      chunk: Buffer,
      target: 'stdout' | 'stderr',
    ): void => {
      const text = chunk.toString('utf8');
      const cur = target === 'stdout' ? stdout.length : stderr.length;
      const remaining = maxOutputBytes - cur;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      if (text.length > remaining) {
        if (target === 'stdout') stdout += text.slice(0, remaining);
        else stderr += text.slice(0, remaining);
        truncated = true;
      } else {
        if (target === 'stdout') stdout += text;
        else stderr += text;
      }
    };

    child.stdout?.on('data', (c: Buffer) => append(c, 'stdout'));
    child.stderr?.on('data', (c: Buffer) => append(c, 'stderr'));

    const timeout = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, opts.timeoutMs);

    const onAbort = (): void => {
      aborted = true;
      killTree(child.pid);
    };
    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) onAbort();
      else opts.abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (opts.abortSignal) opts.abortSignal.removeEventListener('abort', onAbort);
      resolveOutcome({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        aborted,
        truncated,
        durationMs: Date.now() - start,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      if (opts.abortSignal) opts.abortSignal.removeEventListener('abort', onAbort);
      stderr += `\n[spawn error] ${err.message}`;
      resolveOutcome({
        stdout,
        stderr,
        exitCode: null,
        timedOut,
        aborted,
        truncated,
        durationMs: Date.now() - start,
      });
    });
  });
}

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const command = args.command;
  const defaultTimeout = getTimeoutDefault(ctx);
  const timeoutArg = typeof args.timeout_ms === 'number' ? args.timeout_ms : defaultTimeout;
  const timeoutMs = Math.min(Math.max(1_000, timeoutArg), MAX_TIMEOUT_MS);

  if (typeof command !== 'string' || command.trim().length === 0) {
    return { content: 'bash: `command` must be a non-empty string', isError: true };
  }

  let env: Record<string, string> | undefined;
  if (args.env !== undefined) {
    if (
      typeof args.env !== 'object' ||
      args.env === null ||
      Array.isArray(args.env)
    ) {
      return { content: 'bash: `env` must be an object of string→string', isError: true };
    }
    env = {};
    for (const [k, v] of Object.entries(args.env as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        return {
          content: `bash: env.${k} must be a string`,
          isError: true,
        };
      }
      env[k] = v;
    }
  }

  const outcome = await runShell(command, {
    cwd: ctx.projectRoot,
    timeoutMs,
    abortSignal: ctx.abortSignal,
    env,
    maxOutputBytes: getMaxOutputBytes(ctx),
  });

  const parts: string[] = [];
  parts.push(`$ ${command}`);
  if (outcome.stdout) parts.push(outcome.stdout.replace(/\s+$/, ''));
  if (outcome.stderr) parts.push(`[stderr]\n${outcome.stderr.replace(/\s+$/, '')}`);
  parts.push(
    `[exit=${outcome.exitCode ?? 'null'} duration=${outcome.durationMs}ms${
      outcome.timedOut ? ' TIMED_OUT' : ''
    }${outcome.aborted ? ' ABORTED' : ''}${outcome.truncated ? ' TRUNCATED' : ''}]`,
  );

  return {
    content: parts.join('\n\n'),
    isError: outcome.timedOut || outcome.aborted || (outcome.exitCode ?? 0) !== 0,
    structured: {
      exitCode: outcome.exitCode,
      durationMs: outcome.durationMs,
      timedOut: outcome.timedOut,
      aborted: outcome.aborted,
      truncated: outcome.truncated,
    },
  };
}

export const bashTool: RegisteredTool = {
  name: 'bash',
  description:
    'Run a shell command inside the project root. 30s default timeout (max 5 min). Captures stdout/stderr (32 KB cap). For long-running processes (dev servers, watchers), use bash_background instead — synchronous bash will be killed at timeout.',
  planModeAllowed: false,
  mutates: true,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to run. Always relative to the project root.',
      },
      timeout_ms: {
        type: 'integer',
        minimum: 1000,
        maximum: MAX_TIMEOUT_MS,
        description: `Timeout in milliseconds. Default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}.`,
      },
      env: {
        type: 'object',
        description: 'Optional environment variable overrides for this command (string→string).',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
  handler,
};
