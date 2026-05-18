/**
 * Cocos Creator Editor Bridge tools (WebSocket to extensions/spark-cli-bridge).
 */

import { loadMergedConfig } from '../../../config/load.js';
import { bridgeRequest } from '../../../bridge/client.js';
import { detectEngine } from '../../../engines/registry.js';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';

async function bridgePort(ctx: ToolContext): Promise<number> {
  const config = await loadMergedConfig(ctx.projectRoot);
  return config.mcp?.port ?? 17321;
}

export const editorSceneOpenTool: RegisteredTool = {
  name: 'editor_scene_open',
  description:
    'Open a .scene file in Cocos Creator via Editor Bridge (requires spark-cli-bridge extension)',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative scene path, e.g. assets/scenes/main.scene',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  planModeAllowed: true,
  mutates: false,
  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const path = args.path as string | undefined;
    if (!path) return { content: 'path is required', isError: true };
    const engine = detectEngine(ctx.projectRoot, ctx.config.project?.engine).id;
    if (engine !== 'cocos-creator') {
      return {
        content: `editor_scene_open is only for Cocos projects (current: ${engine})`,
        isError: true,
      };
    }
    try {
      const port = await bridgePort(ctx);
      const result = await bridgeRequest('scene.open', { path }, { port });
      return { content: JSON.stringify(result, null, 2) };
    } catch (e) {
      return {
        content: e instanceof Error ? e.message : String(e),
        isError: true,
      };
    }
  },
};

export const editorSelectionGetTool: RegisteredTool = {
  name: 'editor_selection_get',
  description: 'Return current node selection from Cocos Creator Editor Bridge',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  planModeAllowed: true,
  mutates: false,
  async handler(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const engine = detectEngine(ctx.projectRoot, ctx.config.project?.engine).id;
    if (engine !== 'cocos-creator') {
      return {
        content: `editor_selection_get is only for Cocos projects (current: ${engine})`,
        isError: true,
      };
    }
    try {
      const port = await bridgePort(ctx);
      const result = await bridgeRequest('selection.get', {}, { port });
      return { content: JSON.stringify(result, null, 2) };
    } catch (e) {
      return {
        content: e instanceof Error ? e.message : String(e),
        isError: true,
      };
    }
  },
};

export function buildEditorBridgeTools(
  projectRoot: string,
  config: import('../../../config/schema.js').SparkCLIConfig,
): RegisteredTool[] {
  if (detectEngine(projectRoot, config.project?.engine).id !== 'cocos-creator') {
    return [];
  }
  return [editorSceneOpenTool, editorSelectionGetTool];
}
