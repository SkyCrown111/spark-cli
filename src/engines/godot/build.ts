import { detectGodotProject } from './detector.js';

export interface GodotBuildPlan {
  ok: boolean;
  command: string;
  message: string;
}

export function planGodotExport(
  root: string,
  platform: string,
  options: { dryRun?: boolean } = {},
): GodotBuildPlan {
  const info = detectGodotProject(root);
  if (!info) {
    return { ok: false, command: '', message: 'Not a Godot project (project.godot)' };
  }
  const preset = platform === 'web' ? 'Web' : platform === 'windows' ? 'Windows Desktop' : platform;
  const cmd = `godot --headless --path "${root}" --export-release "${preset}" build/${platform}/game`;
  return {
    ok: true,
    command: cmd,
    message: options.dryRun
      ? `Dry run — configure export preset "${preset}" in project.godot`
      : `Requires Godot export preset "${preset}" and GODOT_BIN`,
  };
}
