import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SparkCLIConfig } from '../config/schema.js';
import { detectEngine } from '../engines/registry.js';
import { findSceneFiles } from '../engines/cocos/scene-list.js';
import { parseCocosScene, sceneToMcpTree } from '../engines/cocos/scene-parser.js';
import {
  addSceneNodeToStaging,
  updateSceneComponentInStaging,
} from '../engines/cocos/scene-writer.js';
import {
  removeSceneNodeFromStaging,
  duplicateSceneNodeInStaging,
  reorderSceneChildrenInStaging,
  scanUuidReferences,
  RefIntegrityError,
} from '../engines/cocos/scene-writer-extras.js';
import { findTscnFiles } from '../engines/godot/scene-list.js';
import { parseGodotScene, sceneToMcpTree as godotSceneToMcpTree } from '../engines/godot/scene-parser.js';
import {
  setGodotSceneProperty,
  addGodotSceneNode,
  connectGodotSceneSignal,
} from '../engines/godot/scene-writer.js';
import { lintGdScriptFile } from '../engines/godot/gdscript-lint.js';
import { detectUnrealProject } from '../engines/unreal/detector.js';
import { buildUprojectGraph } from '../engines/unreal/uproject-graph.js';
import { indexUnrealCppDir, findUClass, listUFunctions } from '../engines/unreal/cpp-index.js';
import { findUnitySceneFiles } from '../engines/unity/scene-list.js';
import { parseUnityScene, unitySceneToMcpTree } from '../engines/unity/scene-graph.js';
import {
  setUnitySceneProperty,
  addUnitySceneComponent,
  setUnitySceneNestedProperty,
  removeUnitySceneComponent,
  replaceUnityScenePrefabInstance,
} from '../engines/unity/scene-writer.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isMcpWriteAllowed, mcpWriteDeniedMessage } from './write-guard.js';
import { stageWriteFile } from '../core/staging/patch-manager.js';
import { auditAssets, applyFix } from '../core/assets/audit.js';

function textResult(obj: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
    isError,
  };
}

function cliPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = join(here, 'cli.js');
  if (existsSync(bundled)) return bundled;
  return join(process.cwd(), 'dist', 'cli.js');
}

function mcpEngine(projectRoot: string, config: SparkCLIConfig) {
  return detectEngine(projectRoot, config.project?.engine).id;
}

export function handleMcpTool(
  name: string,
  args: Record<string, unknown> | undefined,
  projectRoot: string,
  config: SparkCLIConfig,
): CallToolResult {
  const engine = mcpEngine(projectRoot, config);

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
      return textResult({ error: mcpWriteDeniedMessage() }, true);
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
      return textResult({ issues: auditAssets(projectRoot, { dir, disable }) });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'assets_fix') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: mcpWriteDeniedMessage() }, true);
    }
    const rule = args?.rule as string | undefined;
    const apply = (args?.apply as boolean | undefined) ?? false;
    if (!rule) return textResult({ error: 'rule required' }, true);
    try {
      const issues = auditAssets(projectRoot).filter((i) => i.rule === rule);
      const results = issues.map((i) => applyFix(projectRoot, i, { apply }));
      return textResult({ rule, applied: apply, results });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (engine === 'godot') {
    if (name === 'tscn_list') {
      return textResult({ scenes: findTscnFiles(projectRoot) });
    }
    if (name === 'tscn_analyze') {
      const path = args?.path as string | undefined;
      if (!path) return textResult({ error: 'path required' }, true);
      const analysis = parseGodotScene(join(projectRoot, path));
      return textResult(godotSceneToMcpTree(analysis));
    }
    if (name === 'gdscript_lint') {
      const path = args?.path as string | undefined;
      if (!path) return textResult({ error: 'path required' }, true);
      try {
        return textResult(lintGdScriptFile(projectRoot, path));
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'tscn_set_property') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const nodePath = args?.nodePath as string | undefined;
      const key = args?.key as string | undefined;
      const value = args?.value as string | undefined;
      if (!scenePath || !nodePath || !key || value === undefined) {
        return textResult({ error: 'path, nodePath, key, and value are required' }, true);
      }
      try {
        return textResult(setGodotSceneProperty(projectRoot, scenePath, nodePath, key, value));
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'tscn_add_node') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const parentPath = args?.parentPath as string | undefined;
      const type = args?.type as string | undefined;
      const newName = args?.name as string | undefined;
      if (!scenePath || !parentPath || !type || !newName) {
        return textResult({ error: 'path, parentPath, type, and name are required' }, true);
      }
      try {
        return textResult(addGodotSceneNode(projectRoot, scenePath, parentPath, type, newName));
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'tscn_connect_signal') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const signal = args?.signal as string | undefined;
      const from = args?.from as string | undefined;
      const to = args?.to as string | undefined;
      const method = args?.method as string | undefined;
      if (!scenePath || !signal || !from || !to || !method) {
        return textResult({ error: 'path, signal, from, to, and method are required' }, true);
      }
      try {
        return textResult(
          connectGodotSceneSignal(projectRoot, scenePath, { signal, from, to, method }),
        );
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    return textResult({ error: `Unknown Godot tool: ${name}` }, true);
  }

  if (engine === 'unreal') {
    if (name === 'unreal_project_info') {
      const info = detectUnrealProject(projectRoot);
      return textResult(info ?? { error: 'not an unreal project' });
    }
    if (name === 'unreal_module_graph') {
      try {
        return textResult(buildUprojectGraph(projectRoot));
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'unreal_cpp_outline') {
      try {
        const dir = (args?.dir as string | undefined) ?? 'Source';
        return textResult({ entries: indexUnrealCppDir(projectRoot, dir) });
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'unreal_find_uclass') {
      const className = args?.name as string | undefined;
      if (!className) return textResult({ error: 'name required' }, true);
      try {
        const entries = indexUnrealCppDir(projectRoot);
        const klass = findUClass(entries, className);
        if (!klass) return textResult({ error: `UCLASS not found: ${className}` }, true);
        return textResult({
          uclass: klass,
          ufunctions: listUFunctions(entries, className),
        });
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    return textResult({ error: `Unknown Unreal tool: ${name}` }, true);
  }

  if (engine === 'unity') {
    if (name === 'unity_scene_list') {
      return textResult({ scenes: findUnitySceneFiles(projectRoot) });
    }
    if (name === 'unity_scene_analyze') {
      const path = args?.path as string | undefined;
      if (!path) return textResult({ error: 'path required' }, true);
      try {
        const scene = parseUnityScene(join(projectRoot, path));
        return textResult(unitySceneToMcpTree(scene));
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'unity_scene_set_property') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const fileId = args?.fileId as string | undefined;
      const key = args?.key as string | undefined;
      const value = args?.value as string | undefined;
      if (!scenePath || !fileId || !key || value === undefined) {
        return textResult({ error: 'path, fileId, key, and value are required' }, true);
      }
      try {
        const result = setUnitySceneProperty(projectRoot, scenePath, fileId, key, value);
        return textResult({
          ...result,
          hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
        });
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'unity_scene_add_component') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const gameObjectFileId = args?.gameObjectFileId as string | undefined;
      const classId = args?.classId as number | undefined;
      const newFileId = args?.newFileId as string | undefined;
      if (!scenePath || !gameObjectFileId || !newFileId || classId === undefined) {
        return textResult({ error: 'path, gameObjectFileId, classId, newFileId are required' }, true);
      }
      try {
        const result = addUnitySceneComponent(projectRoot, scenePath, {
          gameObjectFileId,
          classId,
          newFileId,
          scriptGuid: args?.scriptGuid as string | undefined,
          scriptFileId: args?.scriptFileId as string | undefined,
        });
        return textResult({
          ...result,
          hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
        });
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'unity_scene_set_nested') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const fileId = args?.fileId as string | undefined;
      const nestedPath = args?.nestedPath as string | undefined;
      const value = args?.value as string | undefined;
      if (!scenePath || !fileId || !nestedPath || value === undefined) {
        return textResult(
          { error: 'path, fileId, nestedPath, and value are required' },
          true,
        );
      }
      try {
        const result = setUnitySceneNestedProperty(
          projectRoot,
          scenePath,
          fileId,
          nestedPath,
          value,
        );
        return textResult({
          ...result,
          hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
        });
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'unity_scene_remove_component') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const gameObjectFileId = args?.gameObjectFileId as string | undefined;
      const componentFileId = args?.componentFileId as string | undefined;
      if (!scenePath || !gameObjectFileId || !componentFileId) {
        return textResult(
          { error: 'path, gameObjectFileId, and componentFileId are required' },
          true,
        );
      }
      try {
        const result = removeUnitySceneComponent(
          projectRoot,
          scenePath,
          gameObjectFileId,
          componentFileId,
        );
        return textResult({
          ...result,
          hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
        });
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
    if (name === 'unity_scene_replace_prefab') {
      if (!isMcpWriteAllowed(config)) {
        return textResult({ error: mcpWriteDeniedMessage() }, true);
      }
      const scenePath = args?.path as string | undefined;
      const instanceFileId = args?.instanceFileId as string | undefined;
      const newPrefabGuid = args?.newPrefabGuid as string | undefined;
      const newSourcePrefabFileId = args?.newSourcePrefabFileId as string | undefined;
      if (!scenePath || !instanceFileId || !newPrefabGuid) {
        return textResult(
          { error: 'path, instanceFileId, and newPrefabGuid are required' },
          true,
        );
      }
      try {
        const result = replaceUnityScenePrefabInstance(projectRoot, scenePath, {
          instanceFileId,
          newPrefabGuid,
          newSourcePrefabFileId,
        });
        return textResult({
          ...result,
          hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
        });
      } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
      }
    }
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

  if (name === 'scene_list') {
    return textResult({ scenes: findSceneFiles(projectRoot) });
  }

  if (name === 'scene_analyze') {
    const path = args?.path as string | undefined;
    if (!path) return textResult({ error: 'path required' }, true);
    const full = join(projectRoot, path);
    const analysis = parseCocosScene(full);
    return textResult(sceneToMcpTree(analysis));
  }

  if (name === 'scene_add_node') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: mcpWriteDeniedMessage() }, true);
    }
    const scenePath = args?.path as string | undefined;
    const parentPath = args?.parentPath as string | undefined;
    const nodeName = args?.name as string | undefined;
    if (!scenePath || !parentPath || !nodeName) {
      return textResult({ error: 'path, parentPath, and name are required' }, true);
    }
    try {
      const result = addSceneNodeToStaging(projectRoot, scenePath, parentPath, nodeName);
      return textResult({
        ...result,
        hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
      });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'component_update') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: mcpWriteDeniedMessage() }, true);
    }
    const scenePath = args?.path as string | undefined;
    const nodePath = args?.nodePath as string | undefined;
    const componentType = args?.componentType as string | undefined;
    const properties = args?.properties as Record<string, unknown> | undefined;
    if (!scenePath || !nodePath || !componentType || !properties) {
      return textResult(
        { error: 'path, nodePath, componentType, and properties are required' },
        true,
      );
    }
    try {
      const result = updateSceneComponentInStaging(
        projectRoot,
        scenePath,
        nodePath,
        componentType,
        properties,
      );
      return textResult({
        ...result,
        hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
      });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'scene_remove_node') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: mcpWriteDeniedMessage() }, true);
    }
    const scenePath = args?.path as string | undefined;
    const nodePath = args?.nodePath as string | undefined;
    const force = args?.force === true;
    if (!scenePath || !nodePath) {
      return textResult({ error: 'path and nodePath are required' }, true);
    }
    try {
      const result = removeSceneNodeFromStaging(projectRoot, scenePath, nodePath, { force });
      return textResult({
        ...result,
        hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
      });
    } catch (e) {
      if (e instanceof RefIntegrityError) {
        return textResult({ error: e.message, impact: e.impact }, true);
      }
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'scene_duplicate_node') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: mcpWriteDeniedMessage() }, true);
    }
    const scenePath = args?.path as string | undefined;
    const nodePath = args?.nodePath as string | undefined;
    const newName = args?.newName as string | undefined;
    if (!scenePath || !nodePath) {
      return textResult({ error: 'path and nodePath are required' }, true);
    }
    try {
      const result = duplicateSceneNodeInStaging(projectRoot, scenePath, nodePath, { newName });
      return textResult({
        ...result,
        hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
      });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'scene_reorder_children') {
    if (!isMcpWriteAllowed(config)) {
      return textResult({ error: mcpWriteDeniedMessage() }, true);
    }
    const scenePath = args?.path as string | undefined;
    const parentPath = args?.parentPath as string | undefined;
    const order = args?.order as string[] | undefined;
    if (!scenePath || !parentPath || !Array.isArray(order)) {
      return textResult({ error: 'path, parentPath, and order[] are required' }, true);
    }
    try {
      const result = reorderSceneChildrenInStaging(projectRoot, scenePath, parentPath, order);
      return textResult({
        ...result,
        hint: 'Changes are staged. Run `spark-cli diff` and `spark-cli apply` in the project.',
      });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) }, true);
    }
  }

  if (name === 'scene_scan_uuid_refs') {
    const uuid = args?.uuid as string | undefined;
    if (!uuid) return textResult({ error: 'uuid is required' }, true);
    return textResult({ uuid, hits: scanUuidReferences(projectRoot, uuid) });
  }

  return textResult({ error: `Unknown tool: ${name}` }, true);
}

const COCOS_TOOLS = {
  read: [
    {
      name: 'scene_list',
      description: 'List all .scene files in the Cocos project',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'scene_analyze',
      description: 'Analyze a scene file and return node tree JSON',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path e.g. assets/scenes/main.scene' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: 'scene_scan_uuid_refs',
      description:
        'List every scene/prefab/meta file under assets/ that references the given asset uuid',
      inputSchema: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: '32-byte uuid (with or without dashes)' },
        },
        required: ['uuid'],
        additionalProperties: false,
      },
    },
  ],
  write: [
    {
      name: 'scene_add_node',
      description:
        'Add a child cc.Node under parentPath (staged). Requires mcp.allowWrite: true',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          parentPath: { type: 'string', description: 'e.g. Canvas' },
          name: { type: 'string', description: 'New node name' },
        },
        required: ['path', 'parentPath', 'name'],
        additionalProperties: false,
      },
    },
    {
      name: 'component_update',
      description:
        'Patch component properties on a node (staged). Requires mcp.allowWrite: true',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          nodePath: { type: 'string' },
          componentType: { type: 'string', description: 'e.g. cc.UITransform' },
          properties: { type: 'object', additionalProperties: true },
        },
        required: ['path', 'nodePath', 'componentType', 'properties'],
        additionalProperties: false,
      },
    },
    {
      name: 'scene_remove_node',
      description:
        'Remove a node + its subtree (compacts ids). Refuses if external references exist; pass force:true to override.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          nodePath: { type: 'string' },
          force: { type: 'boolean', description: 'Override RefIntegrityError' },
        },
        required: ['path', 'nodePath'],
        additionalProperties: false,
      },
    },
    {
      name: 'scene_duplicate_node',
      description:
        'Deep-clone a node + its components into the same parent. Internal ids are remapped; new node gets `_copy` suffix unless newName is provided.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          nodePath: { type: 'string' },
          newName: { type: 'string', description: 'Optional override for the clone name' },
        },
        required: ['path', 'nodePath'],
        additionalProperties: false,
      },
    },
    {
      name: 'scene_reorder_children',
      description:
        'Reorder a parent node\'s _children to the supplied name sequence. Sizes must match exactly.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          parentPath: { type: 'string' },
          order: {
            type: 'array',
            items: { type: 'string' },
            description: 'Child names in the desired order',
          },
        },
        required: ['path', 'parentPath', 'order'],
        additionalProperties: false,
      },
    },
  ],
};

const STAGE_FILE_TOOL = {
  name: 'stage_project_file',
  description:
    'Write text content to a project-relative path via staging (requires mcp.allowWrite: true)',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative file path' },
      content: { type: 'string', description: 'Full file contents' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
};

const GODOT_TOOLS = {
  read: [
    {
      name: 'tscn_list',
      description: 'List .tscn scene files in the Godot project',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'tscn_analyze',
      description: 'Parse a .tscn file and return node list',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path e.g. scenes/main.tscn' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: 'gdscript_lint',
      description: 'Run lightweight GDScript static checks on a .gd file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path e.g. scripts/sample.gd' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  ] as McpToolDef[],
  write: [
    STAGE_FILE_TOOL,
    {
      name: 'tscn_set_property',
      description: 'Set or insert a key=value pair inside a [node] block (stages the change)',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          nodePath: { type: 'string', description: '"." for root, e.g. "Player/Btn"' },
          key: { type: 'string' },
          value: { type: 'string', description: 'Raw GDScript-encoded value, e.g. Vector2(1, 2)' },
        },
        required: ['path', 'nodePath', 'key', 'value'],
        additionalProperties: false,
      },
    },
    {
      name: 'tscn_add_node',
      description: 'Append a new [node] header under a parent (stages the change)',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          parentPath: { type: 'string', description: '"." for root' },
          type: { type: 'string', description: 'Godot node class, e.g. Node2D' },
          name: { type: 'string' },
        },
        required: ['path', 'parentPath', 'type', 'name'],
        additionalProperties: false,
      },
    },
    {
      name: 'tscn_connect_signal',
      description: 'Append a [connection] section linking signal → method (stages the change)',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          signal: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          method: { type: 'string' },
        },
        required: ['path', 'signal', 'from', 'to', 'method'],
        additionalProperties: false,
      },
    },
  ] as McpToolDef[],
};

const UNREAL_TOOLS = {
  read: [
    {
      name: 'unreal_project_info',
      description: 'Return .uproject metadata and module name',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'unreal_module_graph',
      description: 'Parse .uproject + Build.cs + Target.cs into { modules, targets }',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'unreal_cpp_outline',
      description: 'Walk Source/ and emit a regex-fallback C++ outline (UCLASS/UFUNCTION/UPROPERTY)',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Subdirectory to walk (defaults to "Source")' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'unreal_find_uclass',
      description: 'Find a UCLASS by name and list its UFUNCTIONs',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'UCLASS name, e.g. ASampleActor' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  ] as McpToolDef[],
  write: [STAGE_FILE_TOOL],
};

const UNITY_TOOLS = {
  read: [
    {
      name: 'unity_scene_list',
      description: 'List .unity scene files under Assets/',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'unity_scene_analyze',
      description: 'Parse a .unity scene and return GameObjects with fileIds + components',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path e.g. Assets/Scenes/Main.unity' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  ] as McpToolDef[],
  write: [
    {
      name: 'unity_scene_set_property',
      description:
        'Set a top-level YAML scalar (e.g. m_Name, m_LocalScale.x) on the doc identified by fileId. Staged.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          fileId: { type: 'string', description: 'fileId from unity_scene_analyze' },
          key: { type: 'string', description: 'Top-level YAML key inside the doc' },
          value: { type: 'string', description: 'Replacement value (rendered verbatim)' },
        },
        required: ['path', 'fileId', 'key', 'value'],
        additionalProperties: false,
      },
    },
    {
      name: 'unity_scene_add_component',
      description:
        'Append a MonoBehaviour stub document and link it to a GameObject. Staged.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          gameObjectFileId: { type: 'string' },
          classId: { type: 'integer', description: 'Unity classId (e.g. 114 for MonoBehaviour)' },
          newFileId: { type: 'string', description: 'Stable, unique fileId for the new component' },
          scriptGuid: { type: 'string', description: 'Script asset GUID (optional)' },
          scriptFileId: { type: 'string', description: 'Script asset fileID (optional)' },
        },
        required: ['path', 'gameObjectFileId', 'classId', 'newFileId'],
        additionalProperties: false,
      },
    },
    {
      name: 'unity_scene_set_nested',
      description:
        'Set a nested YAML field by path (e.g. m_LocalScale.x, m_Component[2].component.fileID). Handles inline flow-maps. Staged.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          fileId: { type: 'string', description: 'fileId from unity_scene_analyze' },
          nestedPath: {
            type: 'string',
            description: 'Dotted path with optional [index]. Example: m_Modifications[0].value',
          },
          value: { type: 'string', description: 'Replacement scalar value (rendered verbatim)' },
        },
        required: ['path', 'fileId', 'nestedPath', 'value'],
        additionalProperties: false,
      },
    },
    {
      name: 'unity_scene_remove_component',
      description:
        'Remove a component from a GameObject (drops the m_Component[] entry AND deletes the component doc). Staged.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          gameObjectFileId: { type: 'string' },
          componentFileId: { type: 'string' },
        },
        required: ['path', 'gameObjectFileId', 'componentFileId'],
        additionalProperties: false,
      },
    },
    {
      name: 'unity_scene_replace_prefab',
      description:
        'Replace a PrefabInstance.m_SourcePrefab guid; rewrites m_Modifications targets sharing the old guid. Staged.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          instanceFileId: { type: 'string', description: 'fileId of the PrefabInstance doc' },
          newPrefabGuid: { type: 'string', description: '32-char hex guid of the new prefab' },
          newSourcePrefabFileId: {
            type: 'string',
            description: 'Optional new fileID for m_SourcePrefab (defaults: keep existing)',
          },
        },
        required: ['path', 'instanceFileId', 'newPrefabGuid'],
        additionalProperties: false,
      },
    },
    STAGE_FILE_TOOL,
  ] as McpToolDef[],
};

type McpToolDef = (typeof COCOS_TOOLS.read)[number] | (typeof COCOS_TOOLS.write)[number];

export function listMcpTools(config: SparkCLIConfig, projectRoot: string) {
  const engine = mcpEngine(projectRoot, config);
  const validateTool = {
    name: 'validate_project',
    description: 'Run spark-cli validate checks (read-only)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  };
  const assetsAuditTool = {
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
  } as unknown as McpToolDef;
  const assetsFixTool = {
    name: 'assets_fix',
    description: 'Stage automatic remediations for matching audit rules',
    inputSchema: {
      type: 'object',
      properties: {
        rule: { type: 'string', description: 'Rule id to fix (e.g. asset-unused)' },
        apply: { type: 'boolean', description: 'Stage the fix; without this a dry-run plan is returned' },
      },
      required: ['rule'],
      additionalProperties: false,
    },
  } as unknown as McpToolDef;

  type ToolPack = { read: McpToolDef[]; write: McpToolDef[] };
  let pack: ToolPack = COCOS_TOOLS;
  if (engine === 'godot') pack = GODOT_TOOLS;
  if (engine === 'unreal') pack = UNREAL_TOOLS;
  if (engine === 'unity') {
    return [
      ...UNITY_TOOLS.read,
      validateTool,
      assetsAuditTool,
      ...(isMcpWriteAllowed(config) ? [...UNITY_TOOLS.write, assetsFixTool] : []),
    ];
  }

  return [
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
