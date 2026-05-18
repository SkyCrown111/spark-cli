/**
 * Tiny 5-field cron parser + matcher.
 *
 * Fields: minute hour day-of-month month day-of-week (Sunday=0).
 * Supports `*`, lists `1,5,15`, ranges `1-5`, steps `* / 5`, and combinations
 * like `0,15-30 / 5`. No `@reboot` / `@daily` shortcuts — keep it small.
 */

export interface CronExpr {
  raw: string;
  fields: number[][]; // 5 sets of allowed values
}

const RANGES: ReadonlyArray<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // dom
  [1, 12], // month
  [0, 6], // dow (Sun=0)
];

function expandField(token: string, idx: number): number[] {
  const [lo, hi] = RANGES[idx]!;
  const out = new Set<number>();
  for (const part of token.split(',')) {
    const [body, stepStr] = part.split('/');
    const step = stepStr ? Number(stepStr) : 1;
    if (!Number.isFinite(step) || step <= 0) throw new Error(`bad step in "${part}"`);
    let start = lo;
    let end = hi;
    if (body && body !== '*') {
      const [a, b] = body.split('-');
      const av = Number(a);
      if (!Number.isFinite(av)) throw new Error(`bad value "${body}"`);
      start = av;
      end = b !== undefined ? Number(b) : av;
      if (!Number.isFinite(end)) throw new Error(`bad value "${body}"`);
    }
    if (start < lo || end > hi || start > end) throw new Error(`field ${idx} out of range: "${part}"`);
    for (let v = start; v <= end; v += step) out.add(v);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function parseCron(raw: string): CronExpr {
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron expression must have 5 fields, got ${parts.length}`);
  }
  const fields = parts.map((p, i) => expandField(p, i));
  return { raw: parts.join(' '), fields };
}

export function matches(expr: CronExpr, when: Date): boolean {
  const m = expr.fields;
  return (
    m[0]!.includes(when.getMinutes()) &&
    m[1]!.includes(when.getHours()) &&
    m[2]!.includes(when.getDate()) &&
    m[3]!.includes(when.getMonth() + 1) &&
    m[4]!.includes(when.getDay())
  );
}

/** Compute the next match strictly after `from`, scanning at minute granularity. */
export function nextRun(expr: CronExpr, from: Date = new Date()): Date {
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (matches(expr, t)) return t;
    t.setMinutes(t.getMinutes() + 1);
  }
  throw new Error('no cron match within 1 year');
}
