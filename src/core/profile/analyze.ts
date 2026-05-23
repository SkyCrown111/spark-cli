/**
 * Normalize profiler JSON into agent-friendly slices.
 */

export interface ProfileSample {
  name: string;
  ms: number;
}

export interface ProfileFrame {
  frame: number;
  ms: number;
  samples: ProfileSample[];
}

export interface ProfileAnalysis {
  source: string;
  frames: ProfileFrame[];
  systems: { name: string; totalMs: number; avgMs: number; maxMs: number }[];
  summary: { frameCount: number; avgFrameMs: number; p95FrameMs: number };
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
}

export function analyzeProfileJson(raw: unknown, source = 'profile.json'): ProfileAnalysis {
  const data = raw as Record<string, unknown>;
  const framesRaw = (data.frames ?? data.Frames ?? []) as unknown[];
  const frames: ProfileFrame[] = [];

  for (let i = 0; i < framesRaw.length; i++) {
    const f = framesRaw[i] as Record<string, unknown>;
    const samplesRaw = (f.samples ?? f.Samples ?? f.markers ?? []) as unknown[];
    const samples: ProfileSample[] = samplesRaw.map((s) => {
      const row = s as Record<string, unknown>;
      return {
        name: String(row.name ?? row.system ?? row.label ?? 'unknown'),
        ms: asNumber(row.ms ?? row.timeMs ?? row.duration),
      };
    });
    frames.push({
      frame: asNumber(f.frame ?? f.index, i),
      ms: asNumber(
        f.ms ?? f.frameMs ?? f.duration,
        samples.reduce((a, b) => a + b.ms, 0),
      ),
      samples,
    });
  }

  const systemTotals = new Map<string, number[]>();
  for (const fr of frames) {
    for (const s of fr.samples) {
      const arr = systemTotals.get(s.name) ?? [];
      arr.push(s.ms);
      systemTotals.set(s.name, arr);
    }
  }

  const systems = [...systemTotals.entries()]
    .map(([name, vals]) => {
      const totalMs = vals.reduce((a, b) => a + b, 0);
      return {
        name,
        totalMs,
        avgMs: vals.length ? totalMs / vals.length : 0,
        maxMs: vals.length ? Math.max(...vals) : 0,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);

  const frameMs = frames.map((f) => f.ms);
  const sorted = [...frameMs].sort((a, b) => a - b);
  const p95 = sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
    : 0;

  return {
    source,
    frames,
    systems,
    summary: {
      frameCount: frames.length,
      avgFrameMs: frameMs.length ? frameMs.reduce((a, b) => a + b, 0) / frameMs.length : 0,
      p95FrameMs: p95,
    },
  };
}
