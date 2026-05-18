import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectUnrealProject } from './detector.js';

export interface UnrealValidateResult {
  ok: boolean;
  message: string;
  skipped?: boolean;
}

export function validateUnrealLayout(root: string): UnrealValidateResult {
  const info = detectUnrealProject(root);
  if (!info) {
    return { ok: false, message: 'Not an Unreal layout (*.uproject + Source/)' };
  }
  const buildCs = join(root, 'Source', info.projectName, `${info.projectName}.Build.cs`);
  const altBuild = existsSync(buildCs)
    ? buildCs
    : join(root, 'Source', info.projectName, 'SparkCLI.Build.cs');
  if (!existsSync(altBuild) && !existsSync(join(root, 'Source', info.projectName))) {
    return { ok: false, message: `Missing Source/${info.projectName}/ module` };
  }
  return {
    ok: true,
    message: `Unreal project ${info.projectName}${info.version ? ` (UE ${info.version})` : ''}`,
  };
}

export function runUnrealBuild(root: string): UnrealValidateResult {
  const info = detectUnrealProject(root);
  if (!info) return { ok: false, message: 'Not an Unreal project' };

  const ubt = process.env.UNREAL_BUILD_TOOL ?? 'UnrealBuildTool';
  const r = spawnSync(
    ubt,
    [`${info.projectName}Editor`, 'Win64', 'Development', `-Project=${info.uprojectPath}`],
    { encoding: 'utf8', shell: true, cwd: root },
  );
  const output = `${r.stderr || ''}${r.stdout || ''}`;
  const missing =
    (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' ||
    /not recognized|外部命令|command not found|9009/i.test(output) ||
    (r.status !== 0 && /^['"]?UnrealBuildTool['"]?/i.test(output.trim()));
  if (missing) {
    return {
      ok: true,
      skipped: true,
      message: 'skipped (UnrealBuildTool not on PATH — set UNREAL_BUILD_TOOL)',
    };
  }
  return {
    ok: r.status === 0,
    message:
      r.status === 0
        ? 'UnrealBuildTool succeeded'
        : output.slice(0, 500) || 'UnrealBuildTool failed',
  };
}
