/**
 * MCP tools — assembled from engine sub-modules.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { SparkCLIConfig } from '../../config/schema.js';
import { findSceneFiles } from '../../engines/cocos/scene-list.js';
import { findTscnFiles } from '../../engines/godot/scene-list.js';
import { findUnitySceneFiles } from '../../engines/unity/scene-list.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isMcpWriteAllowed } from '../write-guard.js';
import { detectEngine } from '../../engines/registry.js';
import { stageWriteFile } from '../../core/staging/patch-manager.js';
import { auditAssets, applyFix } from '../../core/assets/audit.js';
import type { McpToolDef } from './common.js';
import { textResult, cliPath, mcpEngine } from './common.js';
import { COCOS_TOOLS, handleCocosTool } from './cocos.js';
import { GODOT_TOOLS, handleGodotTool } from './godot.js';
import { UNREAL_TOOLS, handleUnrealTool } from './unreal.js';
import { UNITY_TOOLS, handleUnityTool } from './unity.js';

export type { McpToolDef } from './common.js';

function listScenesForEngine(
  engine: ReturnType<typeof mcpEngine>,
  projectRoot: string,
): string[] {
  switch (engine) {
    case 'cocos-creator':
      return findSceneFiles(projectRoot);
    case 'unity':
      return findUnitySceneFiles(projectRoot);
    case 'godot':
      return findTscnFiles(projectRoot);
    default:
      return [];
  }
}

export async function handleMcpTool(
  name: string,
  args: Record<string, unknown> | undefined,
  projectRoot: string,
  config: SparkCLIConfig,
): Promise<CallToolResult> {
  const engine = mcpEngine(projectRoot, config);

  // ── Common tools (all engines) ──
  if (name === 'validate_project') {
    const cli = cliPath();
    const cmd = existsSync(cli) ? process.execPath : 'spark-cli';
    const cmdArgs = existsSync(cli)
      ? [cli, 'validate', '--json', '-P', projectRoot]
      : ['validate', '--json', '-P', projectRoot];
    const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', cwd: projectRoot });
    return {
      content: [{ type: 'text', text: r.stdout || r.stderr || `exit ${r.status}` }],
      isError: r.status !== 0,
    };
  }

  if (name === 'stage_project_file') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: 'Write operations disabled. Set mcp.allowWrite: true in config.' }, true);
    }
    const path = args?.path as string | undefined;
    const content = args?.content as string | undefined;
    if (!path || content === undefined) {
      return textResult({ error: 'path and content are required' }, true);
    }
    try {
      stageWriteFile(projectRoot, path, content);
      return textResult({
        staged: path,
        hint: 'Run spark-cli diff && spark-cli apply in the project.',
      });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'assets_audit') {
    const dir = args?.dir as string | undefined;
    const disable = args?.disable as string[] | undefined;
    try {
      return textResult({ issues: await auditAssets(projectRoot, { dir, disable }) });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'assets_fix') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: 'Write operations disabled. Set mcp.allowWrite: true in config.' }, true);
    }
    const rule = args?.rule as string | undefined;
    const apply = (args?.apply as boolean | undefined) ?? false;
    if (!rule) return textResult({ error: 'rule required' }, true);
    try {
      const issues = (await auditAssets(projectRoot)).filter((i) => i.rule === rule);
      const results = issues.map((i) => applyFix(projectRoot, i, { apply }));
      return textResult({ rule, applied: apply, results });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'scene_list') {
    const scenes = listScenesForEngine(engine, projectRoot);
    const payload: Record<string, unknown> = { scenes, engine };
    if (scenes.length === 0 && engine === 'unknown') {
      payload.hint =
        'No game engine detected. Set project.engine in config or run from a Cocos/Unity/Godot project root. Use glob to discover files.';
    }
    return textResult(payload);
  }

  // ── Engine-specific tools ──
  if (engine === 'godot') {
    const result = handleGodotTool(name, args, projectRoot, config);
    if (result) return result;
    return textResult({ error: `Unknown Godot tool: ${name}` }, true);
  }

  if (engine === 'unreal') {
    const result = handleUnrealTool(name, args, projectRoot);
    if (result) return result;
    return textResult({ error: `Unknown Unreal tool: ${name}` }, true);
  }

  if (engine === 'unity') {
    const result = handleUnityTool(name, args, projectRoot, config);
    if (result) return result;
    return textResult({ error: `Unknown Unity tool: ${name}` }, true);
  }

  if (engine !== 'cocos-creator') {
    return textResult(
      {
        error: `Tool ${name} is only available for Cocos projects (current engine: ${engine})`,
      },
      true,
    );
  }

  const result = handleCocosTool(name, args, projectRoot, config);
  if (result) return result;

  return textResult({ error: `Unknown tool: ${name}` }, true);
}

const SCENE_LIST_TOOL: McpToolDef = {
  name: 'scene_list',
  description:
    'List scene files for the detected engine (.scene for Cocos, .unity for Unity, .tscn for Godot)',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

function buildMcpWriteToolNameSet(): ReadonlySet<string> {
  const s = new Set<string>();
  const add = (arr: readonly { name: string }[]) => {
    for (const t of arr) s.add(t.name);
  };
  add(COCOS_TOOLS.write);
  add(GODOT_TOOLS.write);
  add(UNITY_TOOLS.write);
  add(UNREAL_TOOLS.write);
  s.add('assets_fix');
  return s;
}

export const MCP_WRITE_TOOL_NAMES: ReadonlySet<string> = buildMcpWriteToolNameSet();

export function listMcpTools(config: SparkCLIConfig, projectRoot: string) {
  const engine = mcpEngine(projectRoot, config);
  const validateTool: McpToolDef = {
    name: 'validate_project',
    description: 'Run spark-cli validate checks (read-only)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  };
  const assetsAuditTool: McpToolDef = {
    name: 'assets_audit',
    description: 'Lint texture/audio/unused-asset issues under assets/',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Subdirectory to scan (default: assets)' },
        disable: {
          type: 'array',
          items: { type: 'string' },
          description: 'Rule ids to skip',
        },
      },
      additionalProperties: false,
    },
  };
  const assetsFixTool: McpToolDef = {
    name: 'assets_fix',
    description: 'Stage automatic remediations for matching audit rules',
    inputSchema: {
      type: 'object',
      properties: {
        rule: { type: 'string', description: 'Rule id to fix (e.g. asset-unused)' },
        apply: {
          type: 'boolean',
          description: 'Stage the fix; without this a dry-run plan is returned',
        },
      },
      required: ['rule'],
      additionalProperties: false,
    },
  };

  type ToolPack = { read: McpToolDef[]; write: McpToolDef[] };
  let pack: ToolPack = COCOS_TOOLS;
  if (engine === 'godot') pack = GODOT_TOOLS;
  if (engine === 'unreal') pack = UNREAL_TOOLS;
  if (engine === 'unity') {
    return [
      SCENE_LIST_TOOL,
      ...UNITY_TOOLS.read,
      validateTool,
      assetsAuditTool,
      ...(isMcpWriteAllowed(config) ? [...UNITY_TOOLS.write, assetsFixTool] : []),
    ];
  }

  if (engine === 'unknown') {
    return [
      SCENE_LIST_TOOL,
      validateTool,
      assetsAuditTool,
      ...(isMcpWriteAllowed(config) ? [assetsFixTool] : []),
    ];
  }

  return [
    SCENE_LIST_TOOL,
    ...pack.read,
    validateTool,
    assetsAuditTool,
    ...(isMcpWriteAllowed(config) ? [...pack.write, assetsFixTool] : []),
  ];
}

export function projectInfoResource(projectRoot: string, config: SparkCLIConfig) {
  const detected = detectEngine(projectRoot, config.project?.engine);
  return {
    root: projectRoot,
    engine: config.project?.engine ?? detected.id,
    engineVersion: detected.version ?? config.project?.engineVersion,
    model: config.model,
    mcp: {
      allowWrite: isMcpWriteAllowed(config),
      port: config.mcp?.port ?? 17321,
      toolsForEngine: detected.id,
    },
  };
}
