import { request } from 'undici';
import { SparkCLIError } from '../../utils/errors.js';

export interface FigmaUrlParts {
  fileKey: string;
  nodeId?: string;
}

export function parseFigmaUrl(url: string): FigmaUrlParts {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('figma.com')) {
      throw new Error('not a figma.com URL');
    }
    const parts = u.pathname.split('/').filter(Boolean);
    const designIdx = parts.indexOf('design');
    const fileIdx = parts.indexOf('file');
    const keyIdx = designIdx >= 0 ? designIdx + 1 : fileIdx >= 0 ? fileIdx + 1 : -1;
    if (keyIdx < 0 || !parts[keyIdx]) {
      throw new Error('missing file key');
    }
    let nodeId = u.searchParams.get('node-id') ?? undefined;
    if (nodeId) nodeId = nodeId.replace(/-/g, ':');
    return { fileKey: parts[keyIdx], nodeId };
  } catch (e) {
    throw new SparkCLIError(
      `Invalid Figma URL: ${e instanceof Error ? e.message : String(e)}`,
      1,
      ['Example: https://www.figma.com/design/ABC123/My-File?node-id=1-2'],
    );
  }
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

function summarizeNode(node: FigmaNode, depth = 0): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  lines.push(`${indent}- ${node.type}: ${node.name} (${node.id})`);
  for (const child of node.children ?? []) {
    if (depth < 4) lines.push(...summarizeNode(child, depth + 1));
  }
  return lines;
}

export async function fetchFigmaDesignSummary(
  url: string,
  token: string,
): Promise<{ summary: string; fileKey: string; name?: string }> {
  if (!token) {
    throw new SparkCLIError('FIGMA_TOKEN is required for --figma', 2, [
      'Set environment variable FIGMA_TOKEN or figma.token in spark-cli.config.yaml',
    ]);
  }

  const { fileKey, nodeId } = parseFigmaUrl(url);
  const apiUrl = `https://api.figma.com/v1/files/${fileKey}${nodeId ? `?ids=${encodeURIComponent(nodeId)}` : ''}`;

  const res = await request(apiUrl, {
    method: 'GET',
    headers: { 'X-Figma-Token': token },
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  });

  const text = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new SparkCLIError(`Figma API error (${res.statusCode}): ${text.slice(0, 300)}`, 4);
  }

  const json = JSON.parse(text) as {
    name?: string;
    document?: FigmaNode;
    nodes?: Record<string, { document: FigmaNode }>;
  };

  const lines: string[] = [`Figma file: ${json.name ?? fileKey}`, `File key: ${fileKey}`];
  if (nodeId && json.nodes) {
    for (const entry of Object.values(json.nodes)) {
      lines.push(...summarizeNode(entry.document));
    }
  } else if (json.document) {
    lines.push(...summarizeNode(json.document));
  }

  return {
    fileKey,
    name: json.name,
    summary: lines.join('\n'),
  };
}
