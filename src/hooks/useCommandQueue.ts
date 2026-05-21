/**
 * useCommandQueue — manages a queue of commands for sequential execution.
 *
 * When the user pastes multiple lines of text (e.g., a list of commands),
 * they are queued and executed one at a time. This mirrors cc-haha's
 * command queue behavior where multi-line paste is treated as a sequence
 * of commands.
 *
 * Features:
 * - Queue commands with `enqueue(text)` or `enqueueLines(text)`
 * - Process commands one at a time with `processNext()`
 * - Track queue state (pending count, current command)
 * - Clear the queue with `clear()`
 */

import { useState, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────

export interface QueuedCommand {
  /** Unique ID */
  id: number;
  /** The command text */
  text: string;
  /** Whether this command has been processed */
  processed: boolean;
}

export interface UseCommandQueueOptions {
  /** Callback to execute a command */
  onExecute: (text: string) => void;
  /** Maximum queue size (default: 50) */
  maxQueueSize?: number;
}

export interface UseCommandQueueReturn {
  /** Current queue of commands */
  queue: QueuedCommand[];
  /** Number of pending (unprocessed) commands */
  pendingCount: number;
  /** The command currently being processed */
  currentCommand: QueuedCommand | null;
  /** Enqueue a single command */
  enqueue: (text: string) => void;
  /** Enqueue multiple lines as separate commands */
  enqueueLines: (text: string) => void;
  /** Process the next command in the queue */
  processNext: () => boolean;
  /** Clear the entire queue */
  clear: () => void;
  /** Whether the queue is active (has pending commands) */
  isActive: boolean;
}

// ── Hook ───────────────────────────────────────────────

let nextCommandId = 1;

/**
 * useCommandQueue — hook for managing a queue of commands.
 */
export function useCommandQueue(options: UseCommandQueueOptions): UseCommandQueueReturn {
  const { onExecute, maxQueueSize = 50 } = options;
  const [queue, setQueue] = useState<QueuedCommand[]>([]);
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;

  const pendingCount = queue.filter((c) => !c.processed).length;
  const currentCommand = queue.find((c) => !c.processed) ?? null;
  const isActive = pendingCount > 0;

  const enqueue = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setQueue((prev) => {
      if (prev.length >= maxQueueSize) return prev;
      return [...prev, { id: nextCommandId++, text: trimmed, processed: false }];
    });
  }, [maxQueueSize]);

  const enqueueLines = useCallback((text: string) => {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;

    setQueue((prev) => {
      const newCommands = lines
        .slice(0, maxQueueSize - prev.length)
        .map((text) => ({ id: nextCommandId++, text, processed: false }));
      return [...prev, ...newCommands];
    });
  }, [maxQueueSize]);

  const processNext = useCallback((): boolean => {
    let found = false;

    setQueue((prev) => {
      const nextIndex = prev.findIndex((c) => !c.processed);
      if (nextIndex === -1) return prev;

      found = true;
      const command = prev[nextIndex];
      // Mark as processed
      const updated = [...prev];
      updated[nextIndex] = { ...command, processed: true };

      // Execute asynchronously (outside of setState)
      // Use queueMicrotask to avoid calling during render
      const text = command.text;
      queueMicrotask(() => {
        onExecuteRef.current(text);
      });

      // Remove processed commands that have been superseded (keep last 5 for display)
      const processed = updated.filter((c) => c.processed);
      const unprocessed = updated.filter((c) => !c.processed);
      const recentProcessed = processed.slice(-5);

      return [...recentProcessed, ...unprocessed];
    });

    return found;
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
  }, []);

  return {
    queue,
    pendingCount,
    currentCommand,
    enqueue,
    enqueueLines,
    processNext,
    clear,
    isActive,
  };
}
