/**
 * Adapt MCP tools (in-process, defined in `src/mcp/tools.ts`) into the agent
 * registry. The MCP layer handles engine detection, scene parsing, etc.; we
 * just wrap each entry from `listMcpTools()` so the agent loop sees them as
 * regular `RegisteredTool`s.
 *
 * Permissions: write tools are flagged `mutates: true` and `planModeAllowed:
 * false`. The single-source `permissions.ts` then enforces both plan mode and
 * `mcp.allowWrite` consistently.
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { handleMcpTool, listMcpTools } from '../../../mcp/tools.js';
import { isMcpWriteToolName } from '../permissions.js';
import { getErrorMessage } from '../../../utils/errors.js';

interface McpToolMeta {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

function asParameters(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (schema && typeof schema === 'object' && schema.type === 'object') {
    return schema;
  }
  return { type: 'object', properties: {}, additionalProperties: false };
}

function flattenContent(result: {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): { text: string; isError: boolean } {
  const text = (result.content ?? [])
    .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
    .filter(Boolean)
    .join('\n');
  return { text: text || '(no content)', isError: !!result.isError };
}

export function wrapMcpTool(meta: McpToolMeta): RegisteredTool {
  const mutates = isMcpWriteToolName(meta.name);
  return {
    name: meta.name,
    description: meta.description,
    parameters: asParameters(meta.inputSchema),
    planModeAllowed: !mutates,
    mutates,
    async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      try {
        const result = await handleMcpTool(meta.name, args, ctx.projectRoot, ctx.config);
        const { text, isError } = flattenContent(result);
        return { content: text, isError };
      } catch (e) {
        return {
          content: `MCP tool "${meta.name}" failed: ${getErrorMessage(e)}`,
          isError: true,
        };
      }
    },
  };
}

/**
 * Build the full set of MCP-adapted tools for the current project + config.
 * Engine detection happens inside `listMcpTools`, so this returns engine-
 * appropriate tools only.
 */
export function buildMcpAdaptedTools(
  projectRoot: string,
  config: import('../../../config/schema.js').SparkCLIConfig,
): RegisteredTool[] {
  const metas = listMcpTools(config, projectRoot) as McpToolMeta[];
  return metas.map(wrapMcpTool);
}
