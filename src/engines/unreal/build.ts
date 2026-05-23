import { detectUnrealProject } from './detector.js';

export interface UnrealBuildPlan {
  ok: boolean;
  command: string;
  message: string;
  dryRun?: boolean;
}

export function planUnrealBuild(
  root: string,
  target = 'Development',
  options: { dryRun?: boolean } = {},
): UnrealBuildPlan {
  const info = detectUnrealProject(root);
  if (!info) {
    return { ok: false, command: '', message: 'Not an Unreal project (*.uproject)' };
  }
  const cmd = `UnrealBuildTool ${info.projectName}Editor Win64 ${target} -Project="${info.uprojectPath}"`;
  return {
    ok: true,
    command: cmd,
    message: options.dryRun
      ? 'Dry run — Unreal build command'
      : 'Run UnrealBuildTool (requires UE SDK)',
    dryRun: options.dryRun,
  };
}
