/**
 * Scheduled wake-up tool — allows the agent to schedule a future check-in.
 *
 * This implements the "定时唤醒工具" from the gap-closing plan.
 * The agent can schedule a wake-up to check on long-running processes
 * or follow up on tasks after a delay.
 */

export interface WakeupEntry {
  /** Unique ID for this wake-up. */
  id: string;
  /** When to fire (ISO timestamp). */
  fireAt: string;
  /** Message to deliver when waking up. */
  message: string;
  /** Whether this is a recurring wake-up. */
  recurring?: boolean;
  /** Cron expression for recurring wake-ups. */
  cron?: string;
  /** Whether this wake-up has been delivered. */
  delivered: boolean;
}

// In-memory store for wake-ups (persisted to session)
const wakeups = new Map<string, WakeupEntry>();

/**
 * Schedule a wake-up.
 */
export function scheduleWakeup(
  message: string,
  delayMs: number,
  options?: { recurring?: boolean; cron?: string },
): WakeupEntry {
  const id = `wakeup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fireAt = new Date(Date.now() + delayMs).toISOString();

  const entry: WakeupEntry = {
    id,
    fireAt,
    message,
    recurring: options?.recurring,
    cron: options?.cron,
    delivered: false,
  };

  wakeups.set(id, entry);
  return entry;
}

/**
 * Get all pending wake-ups.
 */
export function getPendingWakeups(): WakeupEntry[] {
  const now = new Date();
  return Array.from(wakeups.values()).filter((w) => !w.delivered && new Date(w.fireAt) <= now);
}

/**
 * Mark a wake-up as delivered.
 */
export function markWakeupDelivered(id: string): void {
  const entry = wakeups.get(id);
  if (entry) {
    entry.delivered = true;
    if (!entry.recurring) {
      wakeups.delete(id);
    }
  }
}

/**
 * Get all wake-ups (for display).
 */
export function listWakeups(): WakeupEntry[] {
  return Array.from(wakeups.values());
}

/**
 * Cancel a wake-up.
 */
export function cancelWakeup(id: string): boolean {
  return wakeups.delete(id);
}

/**
 * Clear all wake-ups.
 */
export function clearWakeups(): void {
  wakeups.clear();
}

/**
 * Parse a human-readable delay string into milliseconds.
 * Supports: "5m", "1h", "30s", "2d"
 */
export function parseDelay(delayStr: string): number | undefined {
  const match = delayStr.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return undefined;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return undefined;
  }
}

/**
 * Format a wake-up entry for display.
 */
export function formatWakeup(entry: WakeupEntry): string {
  const fireTime = new Date(entry.fireAt);
  const now = new Date();
  const diffMs = fireTime.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  const timeStr =
    diffMins > 0
      ? `in ${diffMins} minute${diffMins === 1 ? '' : 's'}`
      : `${Math.abs(diffMins)} minute${Math.abs(diffMins) === 1 ? '' : 's'} ago`;

  return `[${entry.id}] ${timeStr}: ${entry.message}${entry.recurring ? ' (recurring)' : ''}`;
}
