/**
 * Background-task manager for the agent loop.
 *
 * Tracks long-running shell commands launched via `bash_background`. Output is
 * captured into a ring buffer per stream so callers can poll incrementally
 * via `task_output`. Tasks are killed automatically when the process exits or
 * when `stopAll()` is called from `session_end` hooks.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export type BackgroundStatus = 'running' | 'exited' | 'killed' | 'error';

export interface BackgroundTaskInfo {
  id: string;
  command: string;
  cwd: string;
  status: BackgroundStatus;
  startedAt: number;
  endedAt?: number;
  exitCode: number | null;
  durationMs?: number;
}

export interface BackgroundReadResult {
  info: BackgroundTaskInfo;
  stdout: string;
  stderr: string;
  truncated: boolean;
  /** Bytes available beyond what was returned this call. */
  remainingBytes: number;
}

interface InternalTask {
  info: BackgroundTaskInfo;
  child: ChildProcess;
  stdoutBuf: string;
  stderrBuf: string;
  totalStdoutBytes: number;
  totalStderrBytes: number;
  /** Cursor consumed by the last `read({ since: 'last' })` call. */
  readCursorStdout: number;
  readCursorStderr: number;
  truncated: boolean;
}

const RING_LIMIT_BYTES = 1024 * 1024; // 1 MB per stream
const RETAIN_AFTER_EXIT_MS = 60 * 60 * 1000; // 1 hour

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
        /* gone */
      }
    }
  }
}

export class BackgroundTaskManager {
  private tasks = new Map<string, InternalTask>();

  start(opts: { command: string; cwd: string; env?: Record<string, string> }): BackgroundTaskInfo {
    const id = randomUUID().slice(0, 8);
    const child = spawn(opts.command, {
      cwd: opts.cwd,
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });
    const info: BackgroundTaskInfo = {
      id,
      command: opts.command,
      cwd: opts.cwd,
      status: 'running',
      startedAt: Date.now(),
      exitCode: null,
    };
    const task: InternalTask = {
      info,
      child,
      stdoutBuf: '',
      stderrBuf: '',
      totalStdoutBytes: 0,
      totalStderrBytes: 0,
      readCursorStdout: 0,
      readCursorStderr: 0,
      truncated: false,
    };

    const append = (chunk: Buffer, target: 'stdout' | 'stderr'): void => {
      const text = chunk.toString('utf8');
      if (target === 'stdout') {
        task.totalStdoutBytes += chunk.length;
        task.stdoutBuf += text;
        if (task.stdoutBuf.length > RING_LIMIT_BYTES) {
          task.stdoutBuf = task.stdoutBuf.slice(-RING_LIMIT_BYTES);
          task.truncated = true;
        }
      } else {
        task.totalStderrBytes += chunk.length;
        task.stderrBuf += text;
        if (task.stderrBuf.length > RING_LIMIT_BYTES) {
          task.stderrBuf = task.stderrBuf.slice(-RING_LIMIT_BYTES);
          task.truncated = true;
        }
      }
    };
    child.stdout?.on('data', (c: Buffer) => append(c, 'stdout'));
    child.stderr?.on('data', (c: Buffer) => append(c, 'stderr'));

    child.on('close', (code) => {
      info.status = info.status === 'killed' ? 'killed' : 'exited';
      info.exitCode = code;
      info.endedAt = Date.now();
      info.durationMs = info.endedAt - info.startedAt;
      // Schedule garbage collection after retention window.
      setTimeout(() => this.tasks.delete(id), RETAIN_AFTER_EXIT_MS).unref?.();
    });
    child.on('error', (err) => {
      task.stderrBuf += `\n[spawn error] ${err.message}`;
      info.status = 'error';
      info.endedAt = Date.now();
    });

    this.tasks.set(id, task);
    return info;
  }

  list(): BackgroundTaskInfo[] {
    return Array.from(this.tasks.values()).map((t) => ({ ...t.info }));
  }

  read(id: string, opts: { since?: 'start' | 'last' } = {}): BackgroundReadResult | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    const since = opts.since ?? 'last';
    let stdout: string;
    let stderr: string;
    if (since === 'start') {
      stdout = task.stdoutBuf;
      stderr = task.stderrBuf;
    } else {
      stdout = task.stdoutBuf.slice(task.readCursorStdout);
      stderr = task.stderrBuf.slice(task.readCursorStderr);
      task.readCursorStdout = task.stdoutBuf.length;
      task.readCursorStderr = task.stderrBuf.length;
    }
    const remainingBytes = 0; // Buffer is the full snapshot post-trim.
    return {
      info: { ...task.info },
      stdout,
      stderr,
      truncated: task.truncated,
      remainingBytes,
    };
  }

  stop(id: string): BackgroundTaskInfo | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.info.status === 'running') {
      task.info.status = 'killed';
      killTree(task.child.pid);
    }
    return { ...task.info };
  }

  stopAll(): void {
    for (const id of this.tasks.keys()) {
      this.stop(id);
    }
  }
}

let singleton: BackgroundTaskManager | null = null;

export function getBackgroundManager(): BackgroundTaskManager {
  if (!singleton) singleton = new BackgroundTaskManager();
  return singleton;
}

/** Test-only reset. */
export function _resetBackgroundManagerForTests(): void {
  singleton?.stopAll();
  singleton = null;
}
