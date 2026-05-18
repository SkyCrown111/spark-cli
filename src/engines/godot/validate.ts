import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectGodotProject } from './detector.js';

export interface GodotValidateResult {
  ok: boolean;
  message: string;
  skipped?: boolean;
}

export function validateGodotLayout(root: string): GodotValidateResult {
  const info = detectGodotProject(root);
  if (!info) {
    return { ok: false, message: 'Not a Godot layout (project.godot)' };
  }
  const scripts = join(root, 'scripts');
  if (!existsSync(scripts) && !existsSync(join(root, 'scenes'))) {
    return { ok: false, message: 'Missing scripts/ or scenes/' };
  }
  return {
    ok: true,
    message: `Godot project${info.version ? ` (${info.version})` : ''}`,
  };
}

export function runGodotHeadlessCheck(root: string): GodotValidateResult {
  const godot = process.env.GODOT_BIN ?? 'godot';
  const r = spawnSync(godot, ['--headless', '--path', root, '--quit-after', '1'], {
    encoding: 'utf8',
    cwd: root,
    shell: true,
    timeout: 30_000,
  });
  const output = `${r.stderr || ''}${r.stdout || ''}`;
  const missing =
    (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' ||
    /not recognized|外部命令|command not found|9009/i.test(output) ||
    (r.status !== 0 && /^['"]?godot['"]?/i.test(output.trim()));
  if (missing) {
    return {
      ok: true,
      skipped: true,
      message: 'skipped (godot not on PATH — set GODOT_BIN)',
    };
  }
  return {
    ok: r.status === 0,
    message:
      r.status === 0
        ? 'godot --headless check passed'
        : output.slice(0, 500) || 'godot check failed',
  };
}
