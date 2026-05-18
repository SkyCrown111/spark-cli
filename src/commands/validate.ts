import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { detectEngine } from '../engines/registry.js';
import { loadMergedConfig } from '../config/load.js';
import { runDotnetBuild } from '../engines/unity/dotnet-validate.js';
import { validateUnrealLayout, runUnrealBuild } from '../engines/unreal/validate.js';
import { validateGodotLayout, runGodotHeadlessCheck } from '../engines/godot/validate.js';
import { checkSceneIntegrity } from '../core/validate/scene-integrity.js';
import { appendReplayEvent } from '../core/replay/log.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runValidate(opts: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const detected = detectEngine(root, config.project?.engine);
  const results: { name: string; ok: boolean; message: string }[] = [];

  if (detected.id === 'unreal') {
    const layout = validateUnrealLayout(root);
    results.push({ name: 'unreal_project', ok: layout.ok, message: layout.message });
    const build = runUnrealBuild(root);
    results.push({
      name: 'unreal_build',
      ok: build.ok,
      message: build.message,
    });
    results.push({ name: 'typescript', ok: true, message: 'skipped (Unreal C++)' });
    results.push({ name: 'godot_project', ok: true, message: 'skipped (Unreal project)' });
    results.push({ name: 'cocos_project', ok: true, message: 'skipped (Unreal project)' });
    results.push({ name: 'scene_integrity', ok: true, message: 'skipped (Unreal — use Editor)' });
  } else if (detected.id === 'godot') {
    const layout = validateGodotLayout(root);
    results.push({ name: 'godot_project', ok: layout.ok, message: layout.message });
    const check = runGodotHeadlessCheck(root);
    results.push({ name: 'godot_check', ok: check.ok, message: check.message });
    results.push({ name: 'typescript', ok: true, message: 'skipped (Godot GDScript)' });
    results.push({ name: 'unreal_project', ok: true, message: 'skipped (Godot project)' });
    results.push({ name: 'cocos_project', ok: true, message: 'skipped (Godot project)' });
    results.push({ name: 'scene_integrity', ok: true, message: 'skipped (Godot .tscn)' });
  } else if (detected.id === 'unity') {
    const unity = { version: detected.version };
    const dotnet = runDotnetBuild(root);
    results.push({
      name: 'dotnet_build',
      ok: dotnet.ok,
      message: dotnet.message,
    });
    results.push({
      name: 'unity_project',
      ok: true,
      message: `Unity project${unity.version ? ` (${unity.version})` : ''}`,
    });
    results.push({
      name: 'typescript',
      ok: true,
      message: 'skipped (Unity project)',
    });
    results.push({
      name: 'cocos_project',
      ok: true,
      message: 'skipped (Unity project)',
    });
    results.push({
      name: 'scene_integrity',
      ok: true,
      message: 'skipped (Unity — use Editor for scenes)',
    });
  } else {
    const cocos = detected.id === 'cocos-creator';
    const tsconfig = join(root, 'tsconfig.json');
    if (existsSync(tsconfig)) {
      const tscJs = join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
      const r = existsSync(tscJs)
        ? spawnSync(process.execPath, [tscJs, '--noEmit', '-p', tsconfig], {
            cwd: root,
            encoding: 'utf8',
          })
        : spawnSync('npx', ['tsc', '--noEmit', '-p', tsconfig], {
            cwd: root,
            encoding: 'utf8',
            shell: true,
          });
      results.push({
        name: 'typescript',
        ok: r.status === 0,
        message: r.status === 0 ? 'tsc passed' : (r.stderr || r.stdout || 'tsc failed').slice(0, 500),
      });
    } else {
      results.push({
        name: 'typescript',
        ok: true,
        message: 'skipped (no tsconfig.json)',
      });
    }

    results.push({
      name: 'dotnet_build',
      ok: true,
      message: 'skipped (not Unity layout)',
    });

    results.push({
      name: 'unity_project',
      ok: true,
      message: 'skipped (not Unity)',
    });
    results.push({
      name: 'unreal_project',
      ok: true,
      message: 'skipped (not Unreal)',
    });
    results.push({
      name: 'godot_project',
      ok: true,
      message: 'skipped (not Godot)',
    });

    results.push({
      name: 'cocos_project',
      ok: cocos,
      message: cocos ? 'Cocos assets/ present' : 'Not a Cocos layout (assets/)',
    });

    const sceneIssues = checkSceneIntegrity(root);
    const sceneErrors = sceneIssues.filter((i) => i.severity === 'error');
    results.push({
      name: 'scene_integrity',
      ok: sceneErrors.length === 0,
      message:
        sceneErrors.length === 0
          ? sceneIssues.length
            ? `${sceneIssues.length} warning(s)`
            : 'all scenes ok'
          : `${sceneErrors.length} error(s): ${sceneErrors[0]?.message}`,
    });
  }

  const ok = results.every((r) => r.ok);
  appendReplayEvent(root, 'validate', { ok, results });

  if (opts.json) {
    printJson({ ok, results });
    return ok ? 0 : 1;
  }

  console.log(chalk.bold('\nValidate\n'));
  for (const r of results) {
    console.log(`  ${r.ok ? chalk.green('✓') : chalk.red('✗')} ${r.name}: ${r.message}`);
  }
  return ok ? 0 : 1;
}
