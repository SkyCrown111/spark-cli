/**
 * Godot MCP tools — definitions and handler.
 */

import { join } from 'node:path';
import type { SparkCLIConfig } from '../../config/schema.js';
import { findTscnFiles } from '../../engines/godot/scene-list.js';
import {
  parseGodotScene,
  sceneToMcpTree as godotSceneToMcpTree,
} from '../../engines/godot/scene-parser.js';
import {
  setGodotSceneProperty,
  addGodotSceneNode,
  connectGodotSceneSignal,
} from '../../engines/godot/scene-writer.js';
import { lintGdScriptFile } from '../../engines/godot/gdscript-lint.js';
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

export const GODOT_TOOLS = {
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

export function handleGodotTool(
  name: string,
  args: Record<string, unknown> | undefined,
  projectRoot: string,
  config: SparkCLIConfig,
): CallToolResult | null {
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
  return null;
}
