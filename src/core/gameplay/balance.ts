/**
 * CSV ↔ JSON balance sheet conversion + column diff.
 */

export interface BalanceRow {
  [key: string]: string | number;
}

export interface BalanceDiffRow {
  id: string;
  status: 'added' | 'removed' | 'changed' | 'same';
  changes?: Record<string, { from: unknown; to: unknown }>;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function csvToBalance(csv: string): BalanceRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: BalanceRow = {};
    headers.forEach((h, i) => {
      const v = cols[i] ?? '';
      const n = Number(v);
      row[h] = v !== '' && !Number.isNaN(n) && String(n) === v ? n : v;
    });
    return row;
  });
}

export function balanceToCsv(rows: BalanceRow[]): string {
  if (rows.length === 0) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => String(r[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

export function balanceToJson(rows: BalanceRow[]): string {
  return JSON.stringify(rows, null, 2) + '\n';
}

export function jsonToBalance(json: string): BalanceRow[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) throw new Error('JSON balance must be an array');
  return data as BalanceRow[];
}

export function diffBalance(a: BalanceRow[], b: BalanceRow[], idKey = 'id'): BalanceDiffRow[] {
  const mapA = new Map(a.map((r) => [String(r[idKey] ?? ''), r]));
  const mapB = new Map(b.map((r) => [String(r[idKey] ?? ''), r]));
  const ids = new Set([...mapA.keys(), ...mapB.keys()]);
  const out: BalanceDiffRow[] = [];

  for (const id of ids) {
    if (!id) continue;
    const ra = mapA.get(id);
    const rb = mapB.get(id);
    if (ra && !rb) {
      out.push({ id, status: 'removed' });
    } else if (!ra && rb) {
      out.push({ id, status: 'added' });
    } else if (ra && rb) {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
      for (const k of keys) {
        if (ra[k] !== rb[k]) changes[k] = { from: ra[k], to: rb[k] };
      }
      out.push({
        id,
        status: Object.keys(changes).length ? 'changed' : 'same',
        changes: Object.keys(changes).length ? changes : undefined,
      });
    }
  }
  return out;
}
