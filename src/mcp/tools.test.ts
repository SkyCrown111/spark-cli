import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { handleMcpTool } from './tools.js';
import { DEFAULT_CONFIG } from '../config/schema.js';
import { clearStaging, hasStaging } from '../core/staging/patch-manager.js';

const fixture = join(process.cwd(), 'fixtures/cocos-3.8-mini');
const sceneRel = 'assets/scenes/main.scene';

describe('MCP tools', () => {
  it('rejects scene_add_node when allowWrite is false', async () => {
    const config = { ...DEFAULT_CONFIG, mcp: { allowWrite: false, port: 17321 } };
    const res = await handleMcpTool(
      'scene_add_node',
      { path: sceneRel, parentPath: 'Canvas', name: 'TestNode' },
      fixture,
      config,
    );
    expect(res.isError).toBe(true);
    const block = res.content[0];
    expect(block.type).toBe('text');
    if (block.type === 'text') expect(block.text).toContain('allowWrite');
  });

  it('stages scene_add_node when allowWrite is true', async () => {
    if (hasStaging(fixture)) clearStaging(fixture);
    const config = { ...DEFAULT_CONFIG, mcp: { allowWrite: true, port: 17321 } };
    const res = await handleMcpTool(
      'scene_add_node',
      { path: sceneRel, parentPath: 'Canvas', name: 'McpTestNode' },
      fixture,
      config,
    );
    expect(res.isError).toBeFalsy();
    const block = res.content[0];
    expect(block.type).toBe('text');
    if (block.type === 'text') expect(block.text).toContain('staged');
    expect(hasStaging(fixture)).toBe(true);
    clearStaging(fixture);
  });
});
