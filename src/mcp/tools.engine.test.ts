import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { handleMcpTool, listMcpTools, MCP_WRITE_TOOL_NAMES } from './tools.js';
import { DEFAULT_CONFIG } from '../config/schema.js';

const godotFixture = join(process.cwd(), 'fixtures/godot-mini');
const cocosFixture = join(process.cwd(), 'fixtures/cocos-3.8-mini');
const config = { ...DEFAULT_CONFIG, project: { engine: 'godot' as const } };

describe('MCP_WRITE_TOOL_NAMES', () => {
  it('includes Cocos, Unity, Godot writers and assets_fix', () => {
    expect(MCP_WRITE_TOOL_NAMES.has('scene_remove_node')).toBe(true);
    expect(MCP_WRITE_TOOL_NAMES.has('component_update')).toBe(true);
    expect(MCP_WRITE_TOOL_NAMES.has('tscn_set_property')).toBe(true);
    expect(MCP_WRITE_TOOL_NAMES.has('unity_scene_replace_prefab')).toBe(true);
    expect(MCP_WRITE_TOOL_NAMES.has('assets_fix')).toBe(true);
    expect(MCP_WRITE_TOOL_NAMES.has('stage_project_file')).toBe(true);
    expect(MCP_WRITE_TOOL_NAMES.has('scene_list')).toBe(false);
  });
});

describe('MCP engine routing', () => {
  it('lists Godot tools for godot project', () => {
    const tools = listMcpTools(config, godotFixture);
    expect(tools.some((t) => t.name === 'tscn_list')).toBe(true);
    expect(tools.some((t) => t.name === 'scene_list')).toBe(true);
  });

  it('tscn_list returns main scene', async () => {
    const res = await handleMcpTool('tscn_list', {}, godotFixture, config);
    expect(res.isError).toBeFalsy();
    const block = res.content[0];
    if (block.type === 'text') {
      const data = JSON.parse(block.text) as { scenes: string[] };
      expect(data.scenes.some((s) => s.includes('main.tscn'))).toBe(true);
    }
  });

  it('scene_list returns Godot .tscn paths on Godot project', async () => {
    const res = await handleMcpTool('scene_list', {}, godotFixture, config);
    expect(res.isError).toBeFalsy();
    const block = res.content[0];
    if (block.type === 'text') {
      const data = JSON.parse(block.text) as { scenes: string[]; engine: string };
      expect(data.engine).toBe('godot');
      expect(data.scenes.some((s) => s.includes('main.tscn'))).toBe(true);
    }
  });

  it('scene_list on unknown engine returns empty scenes without error', async () => {
    const unknownRoot = join(process.cwd(), 'src');
    const res = await handleMcpTool('scene_list', {}, unknownRoot, DEFAULT_CONFIG);
    expect(res.isError).toBeFalsy();
    const block = res.content[0];
    if (block.type === 'text') {
      const data = JSON.parse(block.text) as { scenes: string[]; engine: string; hint?: string };
      expect(data.engine).toBe('unknown');
      expect(data.scenes).toEqual([]);
      expect(data.hint).toBeTruthy();
    }
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

  it('stage_project_file writes to staging', async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      project: { engine: 'godot' as const },
      mcp: { allowWrite: true, port: 17321 },
    };
    const rel = '.spark-cli/phase12-test.txt';
    const res = await handleMcpTool(
      'stage_project_file',
      { path: rel, content: 'hello phase12' },
      godotFixture,
      cfg,
    );
    expect(res.isError).toBeFalsy();
  });
});
