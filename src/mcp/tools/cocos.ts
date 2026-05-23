/**
 * Cocos Creator MCP tools — definitions and handler.
 */

import { join } from 'node:path';
import type { SparkCLIConfig } from '../../config/schema.js';
import { parseCocosScene, sceneToMcpTree } from '../../engines/cocos/scene-parser.js';
import {
  addSceneNodeToStaging,
  updateSceneComponentInStaging,
} from '../../engines/cocos/scene-writer.js';
import {
  removeSceneNodeFromStaging,
  duplicateSceneNodeInStaging,
  reorderSceneChildrenInStaging,
  scanUuidReferences,
  RefIntegrityError,
} from '../../engines/cocos/scene-writer-extras.js';
import { isMcpWriteAllowed, mcpWriteDeniedMessage } from '../write-guard.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolDef } from './common.js';
import { textResult } from './common.js';

export const COCOS_TOOLS = {
  read: [
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
  ] as McpToolDef[],
  write: [
    {
      name: 'scene_add_node',
      description: 'Add a child cc.Node under parentPath (staged). Requires mcp.allowWrite: true',
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
      description: 'Patch component properties on a node (staged). Requires mcp.allowWrite: true',
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
        "Reorder a parent node's _children to the supplied name sequence. Sizes must match exactly.",
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
  ] as McpToolDef[],
};

export function handleCocosTool(
  name: string,
  args: Record<string, unknown> | undefined,
  projectRoot: string,
  config: SparkCLIConfig,
): CallToolResult | null {
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

  return null;
}
