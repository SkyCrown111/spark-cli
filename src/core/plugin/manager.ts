import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';
import { SparkCLIError } from '../../utils/errors.js';
import type { SparkCLIPluginManifest, InstalledPlugin } from './types.js';

function pluginsDir(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'plugins');
}

function readManifest(dir: string): SparkCLIPluginManifest {
  const path = join(dir, 'spark-cli-plugin.json');
  if (!existsSync(path)) {
    throw new SparkCLIError(`Missing spark-cli-plugin.json in ${dir}`, 1);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SparkCLIPluginManifest;
}

export function listPlugins(projectRoot: string): InstalledPlugin[] {
  const root = pluginsDir(projectRoot);
  if (!existsSync(root)) return [];
  const out: InstalledPlugin[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (!statSync(full).isDirectory()) continue;
    try {
      const m = readManifest(full);
      out.push({
        name: m.name,
        version: m.version,
        path: full,
        description: m.description,
        engines: m.engines,
        hooks: m.hooks,
        mcpServers: m.mcpServers,
      });
    } catch {
      /* skip invalid */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Collect all hook definitions from installed plugins.
 */
export function collectPluginHooks(projectRoot: string): Array<{
  plugin: string;
  event: string;
  command?: string;
  script?: string;
  blocking?: boolean;
}> {
  const plugins = listPlugins(projectRoot);
  const out: Array<{
    plugin: string;
    event: string;
    command?: string;
    script?: string;
    blocking?: boolean;
  }> = [];
  for (const p of plugins) {
    if (!p.hooks) continue;
    for (const h of p.hooks) {
      out.push({
        plugin: p.name,
        event: h.event,
        command: h.command,
        script: h.script ? join(p.path, h.script) : undefined,
        blocking: h.blocking,
      });
    }
  }
  return out;
}

/**
 * Collect all MCP server configs from installed plugins.
 */
export function collectPluginMcpServers(projectRoot: string): Array<{
  name: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}> {
  const plugins = listPlugins(projectRoot);
  const out: Array<{
    name: string;
    transport: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }> = [];
  for (const p of plugins) {
    if (!p.mcpServers) continue;
    for (const s of p.mcpServers) {
      out.push({
        name: `${p.name}__${s.name}`,
        transport: s.transport,
        command: s.command,
        args: s.args,
        env: s.env,
      });
    }
  }
  return out;
}

export function installPlugin(projectRoot: string, sourcePath: string): InstalledPlugin {
  if (!existsSync(sourcePath)) {
    throw new SparkCLIError(`Plugin source not found: ${sourcePath}`, 1);
  }
  const manifest = readManifest(sourcePath);
  const destRoot = pluginsDir(projectRoot);
  mkdirSync(destRoot, { recursive: true });
  const dest = join(destRoot, manifest.name);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(sourcePath, dest, { recursive: true });
  writeFileSync(
    join(dest, '.spark-installed.json'),
    JSON.stringify({ installedAt: new Date().toISOString(), source: sourcePath }, null, 2),
    'utf8',
  );
  return {
    name: manifest.name,
    version: manifest.version,
    path: dest,
    description: manifest.description,
    engines: manifest.engines,
  };
}

export function uninstallPlugin(projectRoot: string, name: string): void {
  const dest = join(pluginsDir(projectRoot), name);
  if (!existsSync(dest)) {
    throw new SparkCLIError(`Plugin not installed: ${name}`, 1);
  }
  rmSync(dest, { recursive: true, force: true });
}
