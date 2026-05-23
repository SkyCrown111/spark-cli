/**
 * doctor-inline — runs the same diagnostic checks as `doctor.ts`
 * but returns a plain markdown string instead of printing to console.
 * Used by the Ink REPL's `/doctor` command.
 */

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
import { validateSkills } from '../core/skills/validate.js';
import { loadHookConfig } from '../core/hooks/config.js';
import { listMemories } from '../core/memory/cross-session-store.js';
import { listJobs as listCronJobs } from '../core/cron/store.js';
import { getProjectSparkDir } from '../config/paths.js';
import { listEngineMcpTools } from '../mcp/engine-tools.js';
import { buildCapabilitySnapshot } from '../core/capabilities/snapshot.js';

interface Check {
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Run diagnostic checks and return the result as a markdown string.
 */
export async function runDoctorChecks(projectRoot: string): Promise<string> {
  const root = projectRoot;
  const checks: Check[] = [];

  // Node version
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  checks.push({
    name: 'node',
    ok: nodeOk,
    message: nodeOk
      ? `Node ${process.versions.node}`
      : `Node ${process.versions.node} (need >= 20)`,
  });

  // Config
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

  // Model
  const provider = config?.model?.provider ?? 'auto';
  const model = config?.model?.default;
  if (model) {
    checks.push({ name: 'model', ok: true, message: `Default model: ${provider}/${model}` });
  } else {
    checks.push({ name: 'model', ok: false, message: 'No default model configured' });
  }

  // API key
  if (provider !== 'auto') {
    const custom = config?.providers?.custom_providers?.find((p) => p.name === provider);
    if (custom) {
      const keyEnv = custom.key_env?.trim();
      if (keyEnv && !isEnvVarName(keyEnv)) {
        checks.push({
          name: 'api_key',
          ok: false,
          message: `key_env must be a name like MIMO_API_KEY, not the token`,
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
        checks.push({ name: 'model_resolve', ok: true, message: `Resolved: ${provider}/${model}` });
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

  // Engine detection
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
  }

  // Parity snapshot
  const parity = (() => {
    const reg = config
      ? buildDefaultRegistry({ projectRoot: root, config, includeMcp: false })
      : null;
    const tools =
      reg
        ?.list({ mode: 'normal' })
        .map((t) => t.function.name)
        .sort() ?? [];

    const skillReg = createSkillRegistry();
    if (config) loadSkillsFromDisk(skillReg, root);
    const skills = skillReg
      .list()
      .map((s) => s.name)
      .sort();
    const skillValidation = config
      ? validateSkills(root, config)
      : { errors: [] as string[], warnings: [] as string[] };

    const hooksCfg = loadHookConfig(root);
    const hooks = Object.fromEntries(
      Object.entries(hooksCfg).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    );

    let memoryCount = 0;
    try {
      memoryCount = listMemories(root).length;
    } catch {
      /* ignore */
    }

    const worktreeDir = join(getProjectSparkDir(root), 'worktrees');
    const worktrees = existsSync(worktreeDir);
    const cronCount = (() => {
      try {
        return listCronJobs().length;
      } catch {
        return 0;
      }
    })();

    const web = config?.tools?.web?.enabled === true;

    const engineMcp = config ? listEngineMcpTools(root, config) : [];
    const capabilities = config ? buildCapabilitySnapshot(config) : null;

    if (capabilities && !capabilities.subagent.modelResolveOk) {
      checks.push({
        name: 'subagent_model',
        ok: false,
        message: capabilities.subagent.modelResolveMessage ?? 'subagent.model invalid',
      });
    } else if (capabilities?.subagent.model) {
      checks.push({
        name: 'subagent_model',
        ok: true,
        message: `subagent.model: ${capabilities.subagent.model}`,
      });
    }

    return {
      tools,
      skills,
      skillValidation,
      hooks,
      memoryCount,
      worktrees,
      cronCount,
      web,
      engineMcp,
      capabilities,
    };
  })();

  // Format as markdown
  const lines: string[] = [];
  lines.push('## SparkCLI Doctor\n');

  for (const c of checks) {
    const icon = c.ok ? '`OK`' : '`FAIL`';
    lines.push(`- ${icon} **${c.name}** — ${c.message}`);
  }

  const allOk = checks.every((c) => c.ok);
  lines.push(allOk ? '\n**All checks passed.**' : '\n**Some checks failed.**');

  lines.push('\n## Parity\n');
  lines.push(`- **tools** ${parity.tools.length} registered`);
  lines.push(`- **skills** ${parity.skills.length} loaded`);
  if (parity.skillValidation.errors.length > 0) {
    for (const e of parity.skillValidation.errors) lines.push(`  - ${e}`);
  }
  const hookSummary = Object.entries(parity.hooks)
    .map(([k, n]) => `${k}=${n}`)
    .join(' ');
  lines.push(`- **hooks** ${hookSummary || '(none)'}`);
  lines.push(`- **memory** ${parity.memoryCount} entries`);
  lines.push(`- **worktrees** ${parity.worktrees ? 'dir present' : 'no worktrees yet'}`);
  lines.push(`- **cron** ${parity.cronCount} job(s)`);
  lines.push(`- **web** ${parity.web ? 'enabled' : 'disabled'}`);

  if (parity.capabilities) {
    const c = parity.capabilities;
    lines.push(`- **imageGen** ${c.imageGen.enabled ? c.imageGen.effectiveProvider : 'disabled'}`);
    lines.push(`- **audioGen** ${c.audioGen.enabled ? c.audioGen.effectiveProvider : 'disabled'}`);
    const opt = Object.entries(c.optionalPackages)
      .filter(([, v]) => !v.installed)
      .map(([k]) => k);
    if (opt.length > 0) lines.push(`- **optional** not installed: ${opt.join(', ')}`);
  }

  return lines.join('\n');
}
