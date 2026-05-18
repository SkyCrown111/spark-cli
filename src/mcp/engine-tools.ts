/**
 * Engine bridge capabilities exposed as MCP tool metadata (reverse MCP).
 */

import { detectEngine } from '../engines/registry.js';
import type { SparkCLIConfig } from '../config/schema.js';

export interface EngineMcpToolMeta {
  name: string;
  description: string;
  engine: string;
  available: boolean;
  reason?: string;
}

const COCOS_TOOLS: Omit<EngineMcpToolMeta, 'available' | 'reason' | 'engine'>[] = [
  { name: 'cocos_build_scene', description: 'Build active scene via Cocos Editor Bridge' },
  { name: 'cocos_bake_lighting', description: 'Bake lighting in Cocos (when bridge supports)' },
  { name: 'editor_playmode_start', description: 'Start Cocos preview play mode' },
  { name: 'editor_playmode_stop', description: 'Stop Cocos preview play mode' },
  { name: 'editor_console_tail', description: 'Tail Cocos Editor console warnings/errors' },
];

const UNITY_TOOLS: Omit<EngineMcpToolMeta, 'available' | 'reason' | 'engine'>[] = [
  { name: 'unity_bake_lighting', description: 'Bake lighting in Unity Editor' },
  { name: 'unity_frame_debugger_capture', description: 'Capture Frame Debugger snapshot' },
  { name: 'editor_playmode_start', description: 'Enter Unity Play Mode' },
  { name: 'editor_playmode_stop', description: 'Exit Unity Play Mode' },
];

const UNREAL_TOOLS: Omit<EngineMcpToolMeta, 'available' | 'reason' | 'engine'>[] = [
  { name: 'unreal_compile_blueprint', description: 'Compile active Blueprint (Editor Bridge)' },
  { name: 'editor_console_tail', description: 'Tail Unreal Output Log' },
];

export function listEngineMcpTools(
  projectRoot: string,
  config: SparkCLIConfig,
): EngineMcpToolMeta[] {
  const engine = detectEngine(projectRoot, config.project?.engine).id;
  const bridgePort = config.mcp?.port ?? 17321;

  const wrap = (
    defs: Omit<EngineMcpToolMeta, 'available' | 'reason' | 'engine'>[],
    eng: string,
    available: boolean,
    reason?: string,
  ): EngineMcpToolMeta[] =>
    defs.map((d) => ({
      ...d,
      engine: eng,
      available,
      reason,
    }));

  if (engine === 'cocos-creator') {
    return wrap(COCOS_TOOLS, engine, true, `bridge ws://127.0.0.1:${bridgePort}`);
  }
  if (engine === 'unity') {
    const hasPackage = false; // packages/unity stub — flip when bridge connects
    return wrap(
      UNITY_TOOLS,
      engine,
      hasPackage,
      hasPackage ? undefined : 'Install packages/unity/com.spark-cli.bridge',
    );
  }
  if (engine === 'unreal') {
    return wrap(UNREAL_TOOLS, engine, false, 'SparkCLIBridge plugin not connected');
  }
  return [];
}
