/**
 * MCP tools — re-exported from engine sub-modules.
 *
 * This file exists for backward compatibility. New code should import
 * from './tools/index.js' directly.
 */

export { handleMcpTool, listMcpTools, MCP_WRITE_TOOL_NAMES, projectInfoResource } from './tools/index.js';
export type { McpToolDef } from './tools/index.js';
