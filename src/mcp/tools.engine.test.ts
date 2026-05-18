import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { handleMcpTool, listMcpTools } from './tools.js';
import { DEFAULT_CONFIG } from '../config/schema.js';

const godotFixture = join(process.cwd(), 'fixtures/godot-mini');
const cocosFixture = join(process.cwd(), 'fixtures/cocos-3.8-mini');
const config = { ...DEFAULT_CONFIG, project: { engine: 'godot' as const } };

describe('MCP engine routing', () => {
  it('lists Godot tools for godot project', () => {
    const tools = listMcpTools(config, godotFixture);
    expect(tools.some((t) => t.name === 'tscn_list')).toBe(true);
    expect(tools.some((t) => t.name === 'scene_list')).toBe(false);
  });

  it('tscn_list returns main scene', () => {
    const res = handleMcpTool('tscn_list', {}, godotFixture, config);
    expect(res.isError).toBeFalsy();
    const block = res.content[0];
    if (block.type === 'text') {
      const data = JSON.parse(block.text) as { scenes: string[] };
      expect(data.scenes.some((s) => s.includes('main.tscn'))).toBe(true);
    }
  });

  it('rejects Cocos scene_list on Godot project', () => {
    const res = handleMcpTool('scene_list', {}, godotFixture, config);
    expect(res.isError).toBe(true);
  });

  it('lists Cocos tools for cocos fixture', () => {
    const cocosConfig = { ...DEFAULT_CONFIG, project: { engine: 'cocos-creator' as const } };
    const tools = listMcpTools(cocosConfig, cocosFixture);
    expect(tools.some((t) => t.name === 'scene_list')).toBe(true);
  });

  it('lists stage_project_file for Godot when allowWrite', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      project: { engine: 'godot' as const },
      mcp: { allowWrite: true, port: 17321 },
    };
    const tools = listMcpTools(cfg, godotFixture);
    expect(tools.some((t) => t.name === 'stage_project_file')).toBe(true);
  });

  it('stage_project_file writes to staging', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      project: { engine: 'godot' as const },
      mcp: { allowWrite: true, port: 17321 },
    };
    const rel = '.spark-cli/phase12-test.txt';
    const res = handleMcpTool(
      'stage_project_file',
      { path: rel, content: 'hello phase12' },
      godotFixture,
      cfg,
    );
    expect(res.isError).toBeFalsy();
  });
});
