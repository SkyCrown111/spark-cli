import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadMergedConfig } from '../config/load.js';
import { scanProjectContext } from '../core/context/project-scanner.js';
import { findSceneFiles } from '../engines/cocos/scene-list.js';
import { parseCocosScene, sceneToMcpTree } from '../engines/cocos/scene-parser.js';
import { handleMcpTool, listMcpTools, projectInfoResource } from './tools.js';

function getProjectRoot(): string {
  return process.env.SPARK_CLI_PROJECT ?? process.cwd();
}

export async function startMcpServer(): Promise<void> {
  const projectRoot = getProjectRoot();
  const config = await loadMergedConfig(projectRoot);

  const server = new Server(
    { name: 'spark-cli', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {} } },
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'spark-cli://project/info',
        name: 'Project Info',
        description: 'Engine, model config, MCP settings',
        mimeType: 'application/json',
      },
      {
        uri: 'spark-cli://project/structure',
        name: 'Project Structure',
        description: 'Script paths and context summary',
        mimeType: 'application/json',
      },
      {
        uri: 'spark-cli://scene/tree',
        name: 'Scene Tree',
        description: 'Parsed node tree of active or first scene',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === 'spark-cli://project/info') {
      const body = projectInfoResource(projectRoot, config);
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }],
      };
    }

    if (uri === 'spark-cli://project/structure') {
      const ctx = scanProjectContext(projectRoot);
      const body = { summary: ctx.summary, scriptPaths: ctx.scriptPaths };
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }],
      };
    }

    if (uri === 'spark-cli://scene/tree') {
      const sceneRel = process.env.SPARK_CLI_SCENE ?? findSceneFiles(projectRoot)[0];
      if (!sceneRel) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'No .scene file found under assets/' }),
            },
          ],
        };
      }
      const full = join(projectRoot, sceneRel);
      if (!existsSync(full)) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ error: `Scene not found: ${sceneRel}` }),
            },
          ],
        };
      }
      const analysis = parseCocosScene(full);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(sceneToMcpTree(analysis), null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMcpTools(config, projectRoot),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleMcpTool(name, (args as Record<string, unknown>) ?? {}, projectRoot, config);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
