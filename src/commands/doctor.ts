import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadMergedConfig } from '../config/load.js';
import {
  BUILTIN_PROVIDERS,
  resolveConfiguredApiKey,
  resolveCustomProviderApiKey,
  isEnvVarName,
} from '../core/providers/registry.js';
import { resolveModelForTask } from '../core/providers/router.js';
import { detectCocosProject } from '../engines/cocos/detector.js';
import { detectUnityProject } from '../engines/unity/detector.js';
import { isDotnetAvailable } from '../engines/unity/dotnet-validate.js';
import { buildDefaultRegistry } from '../core/agent/tools/index.js';
import { createSkillRegistry } from '../core/skills/registry.js';
import { loadSkillsFromDisk } from '../core/skills/loader.js';
import { loadHookConfig } from '../core/hooks/config.js';
import { listMemories } from '../core/memory/cross-session-store.js';
import { listJobs as listCronJobs } from '../core/cron/store.js';
import { getCrossSessionMemoryDir, getProjectSparkDir } from '../config/paths.js';
import { listEngineMcpTools } from '../mcp/engine-tools.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

interface Check {
  name: string;
  ok: boolean;
  message: string;
}

export async function runDoctor(opts: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(opts);
  const checks: Check[] = [];

  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  checks.push({
    name: 'node',
    ok: nodeOk,
    message: nodeOk ? `Node ${process.versions.node}` : `Node ${process.versions.node} (need >= 20)`,
  });

  let config;
  try {
    config = await loadMergedConfig(root);
    checks.push({ name: 'config', ok: true, message: 'Configuration loaded' });
  } catch (e) {
    checks.push({
      name: 'config',
      ok: false,
      message: e instanceof Error ? e.message : 'Invalid config',
    });
    config = null;
  }

  const provider = config?.model?.provider ?? 'auto';
  const model = config?.model?.default;
  if (model) {
    checks.push({
      name: 'model',
      ok: true,
      message: `Default model: ${provider}/${model}`,
    });
  } else {
    checks.push({
      name: 'model',
      ok: false,
      message: 'No default model — run: spark-cli model use <provider>/<model>',
    });
  }

  if (provider !== 'auto') {
    const custom = config?.providers?.custom_providers?.find((p) => p.name === provider);
    if (custom) {
      const keyEnv = custom.key_env?.trim();
      if (keyEnv && !isEnvVarName(keyEnv)) {
        checks.push({
          name: 'api_key',
          ok: false,
          message: `key_env must be a name like MIMO_API_KEY, not the token (use $env:MIMO_API_KEY or api_key)`,
        });
      } else {
        const resolved = resolveCustomProviderApiKey(custom);
        checks.push({
          name: 'api_key',
          ok: Boolean(resolved.apiKey),
          message: resolved.apiKey
            ? `Custom provider ${provider} key ok`
            : keyEnv
              ? `Set environment variable ${keyEnv}`
              : `Set api_key or key_env for custom provider ${provider}`,
        });
      }
    } else {
      const key = resolveConfiguredApiKey(config ?? {}, provider);
      checks.push({
        name: 'api_key',
        ok: Boolean(key),
        message: key
          ? `API key/env for ${provider} found`
          : `Missing env for ${provider} (${BUILTIN_PROVIDERS.find((p) => p.id === provider)?.envKey})`,
      });
    }
    if (config && model) {
      try {
        resolveModelForTask(config, 'chat');
        checks.push({
          name: 'model_resolve',
          ok: true,
          message: `Resolved: ${provider}/${model}`,
        });
      } catch (e) {
        checks.push({
          name: 'model_resolve',
          ok: false,
          message: e instanceof Error ? e.message : 'Model resolve failed',
        });
      }
    }
  } else if (config?.providers?.fallback_providers?.length) {
    checks.push({
      name: 'api_key',
      ok: true,
      message: `provider=auto with ${config.providers.fallback_providers.length} fallback(s)`,
    });
  } else {
    checks.push({
      name: 'api_key',
      ok: false,
      message: 'Set provider or fallback_providers in config',
    });
  }

  const unity = detectUnityProject(root);
  if (unity || config?.project?.engine === 'unity') {
    checks.push({
      name: 'unity',
      ok: Boolean(unity),
      message: unity
        ? `Unity project detected${unity.version ? ` (${unity.version})` : ''}`
        : 'Expected Unity project but Assets/ not found',
    });
    const dotnetOk = isDotnetAvailable();
    checks.push({
      name: 'dotnet',
      ok: dotnetOk,
      message: dotnetOk ? 'dotnet SDK available' : 'dotnet not found (needed for validate)',
    });
    if (config?.project?.unityPath) {
      checks.push({
        name: 'unity_path',
        ok: true,
        message: `unityPath: ${config.project.unityPath}`,
      });
    }
  }

  const cocos = unity ? null : detectCocosProject(root);
  if (config?.project?.engine === 'cocos-creator' || cocos) {
    checks.push({
      name: 'cocos',
      ok: Boolean(cocos),
      message: cocos
        ? `Cocos project detected${cocos.version ? ` (${cocos.version})` : ''}`
        : 'Expected Cocos project but assets/ not found',
    });
    if (config?.project?.creatorPath) {
      checks.push({
        name: 'creator_path',
        ok: true,
        message: `creatorPath: ${config.project.creatorPath}`,
      });
    }
  }

  const allOk = checks.every((c) => c.ok);

  // Parity snapshot — surfaces the Phase 13 alignment surface so users can see
  // tools/skills/hooks/memory/worktree/cron at a glance.
  const parity = (() => {
    const reg = config ? buildDefaultRegistry({ projectRoot: root, config, includeMcp: false }) : null;
    const tools = reg?.list({ mode: 'normal' }).map((t) => t.function.name).sort() ?? [];

    const skillReg = createSkillRegistry();
    if (config) loadSkillsFromDisk(skillReg, root);
    const skills = skillReg.list().map((s) => s.name).sort();

    const hooksCfg = loadHookConfig(root);
    const hooks = Object.fromEntries(
      Object.entries(hooksCfg).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    );

    let memoryCount = 0;
    let memoryDir = '';
    try {
      memoryDir = getCrossSessionMemoryDir(root);
      memoryCount = listMemories(root).length;
    } catch { /* ignore */ }

    const worktreeDir = join(getProjectSparkDir(root), 'worktrees');
    const worktrees = existsSync(worktreeDir);
    const cronCount = (() => {
      try { return listCronJobs().length; } catch { return 0; }
    })();

    const web = config?.tools?.web?.enabled === true;

    const engineMcp = config ? listEngineMcpTools(root, config) : [];

    return {
      tools: { count: tools.length, names: tools },
      skills: { count: skills.length, names: skills },
      hooks,
      memory: { count: memoryCount, dir: memoryDir },
      worktrees: { dirExists: worktrees, dir: worktreeDir },
      cron: { count: cronCount },
      web: { enabled: web },
      engineMcp: {
        count: engineMcp.length,
        available: engineMcp.filter((t) => t.available).map((t) => t.name),
        pending: engineMcp.filter((t) => !t.available).map((t) => t.name),
      },
    };
  })();

  if (opts.json) {
    printJson({ ok: allOk, checks, parity });
    return allOk ? 0 : 2;
  }

  console.log(chalk.bold('\nSparkCLI Doctor\n'));
  for (const c of checks) {
    const icon = c.ok ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon} ${chalk.dim(c.name)}  ${c.message}`);
  }
  console.log(chalk.bold('\nParity'));
  console.log(`  ${chalk.dim('tools')}     ${parity.tools.count} registered`);
  console.log(`  ${chalk.dim('skills')}    ${parity.skills.count} loaded`);
  const hookSummary = Object.entries(parity.hooks).map(([k, n]) => `${k}=${n}`).join(' ');
  console.log(`  ${chalk.dim('hooks')}     ${hookSummary || '(none)'}`);
  console.log(`  ${chalk.dim('memory')}    ${parity.memory.count} entries`);
  console.log(`  ${chalk.dim('worktree')}  ${parity.worktrees.dirExists ? 'dir present' : 'no worktrees yet'}`);
  console.log(`  ${chalk.dim('cron')}      ${parity.cron.count} job(s)`);
  console.log(`  ${chalk.dim('web')}       ${parity.web.enabled ? 'enabled' : 'disabled'}`);
  console.log(allOk ? chalk.green('\nAll checks passed.') : chalk.yellow('\nSome checks failed.'));
  return allOk ? 0 : 2;
}
