/**
 * Unreal Engine MCP tools — definitions and handler.
 */

import { detectUnrealProject } from '../../engines/unreal/detector.js';
import { buildUprojectGraph } from '../../engines/unreal/uproject-graph.js';
import { indexUnrealCppDir, findUClass, listUFunctions } from '../../engines/unreal/cpp-index.js';
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

export const UNREAL_TOOLS = {
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
      description:
        'Walk Source/ and emit a regex-fallback C++ outline (UCLASS/UFUNCTION/UPROPERTY)',
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

export function handleUnrealTool(
  name: string,
  args: Record<string, unknown> | undefined,
  projectRoot: string,
): CallToolResult | null {
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
  return null;
}
