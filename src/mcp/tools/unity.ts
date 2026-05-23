/**
 * Unity MCP tools — definitions and handler.
 */

import { join } from 'node:path';
import type { SparkCLIConfig } from '../../config/schema.js';
import { findUnitySceneFiles } from '../../engines/unity/scene-list.js';
import { parseUnityScene, unitySceneToMcpTree } from '../../engines/unity/scene-graph.js';
import {
  setUnitySceneProperty,
  addUnitySceneComponent,
  setUnitySceneNestedProperty,
  removeUnitySceneComponent,
  replaceUnityScenePrefabInstance,
} from '../../engines/unity/scene-writer.js';
import { isMcpWriteAllowed, mcpWriteDeniedMessage } from '../write-guard.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolDef } from './common.js';
import { textResult } from './common.js';

const STAGE_FILE_TOOL: McpToolDef = {
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

export const UNITY_TOOLS = {
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
      description: 'Append a MonoBehaviour stub document and link it to a GameObject. Staged.',
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

export function handleUnityTool(
  name: string,
  args: Record<string, unknown> | undefined,
  projectRoot: string,
  config: SparkCLIConfig,
): CallToolResult | null {
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
      return textResult(
        { error: 'path, gameObjectFileId, classId, newFileId are required' },
        true,
      );
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
      return textResult({ error: 'path, fileId, nestedPath, and value are required' }, true);
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
      return textResult({ error: 'path, instanceFileId, and newPrefabGuid are required' }, true);
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
  return null;
}
