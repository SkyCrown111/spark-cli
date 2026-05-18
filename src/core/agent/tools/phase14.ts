/**
 * Phase 14 agent tools (validate, shader, profile, art, gameplay, playtest, farm, gen).
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import { lintPerfInProject } from '../../validate/perf-lint.js';
import { runPlatformMatrix } from '../../validate/platform-matrix.js';
import { lintShadersInProject } from '../../shader/lint.js';
import { translateShader, type ShaderTarget } from '../../shader/translate.js';
import { auditMaterials } from '../../shader/material-audit.js';
import { analyzeProfileJson } from '../../profile/analyze.js';
import { checkFrameBudget } from '../../profile/budget.js';
import { planProfileCapture } from '../../profile/capture.js';
import { stageAtlasManifest, spritesFromDirectory } from '../../art/atlas.js';
import { importSpineToStaging } from '../../art/spine-import.js';
import { importDragonBonesToStaging } from '../../art/dragonbones-import.js';
import { importLottieToStaging } from '../../art/lottie-import.js';
import { importTmxFile } from '../../gameplay/tilemap.js';
import {
  csvToBalance,
  balanceToJson,
  balanceToCsv,
  jsonToBalance,
  diffBalance,
} from '../../gameplay/balance.js';
import { suggestNextLevel, type LevelMetrics } from '../../gameplay/difficulty.js';
import {
  createPlaytestSession,
  serializePlaytestSession,
  parsePlaytestSession,
} from '../../playtest/protocol.js';
import { replayPlaytestSession, comparePlaytestHashes } from '../../playtest/runner.js';
import {
  acquireStagingLock,
  releaseStagingLock,
  listStagingLocks,
} from '../../staging/locks.js';
import { generateImageAsset, isImageGenEnabled } from '../../providers/image-gen.js';
import { generateAudioAsset, isAudioGenEnabled } from '../../providers/audio-gen.js';
import { bridgeRequest } from '../../../bridge/client.js';
import { detectEngine } from '../../../engines/registry.js';
import { runAgentTurnForCli } from '../run-turn.js';

function jsonResult(data: unknown, isError = false): ToolResult {
  return { content: JSON.stringify(data, null, 2), isError };
}

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>,
  opts: { mutates?: boolean; planModeAllowed?: boolean } = {},
): RegisteredTool {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
    mutates: opts.mutates ?? false,
    planModeAllowed: opts.planModeAllowed ?? true,
    handler,
  };
}

export const perfLintTool = tool(
  'perf_lint',
  'Scan game scripts for perf anti-patterns (allocations in tick, timer leaks)',
  { dirs: { type: 'array', items: { type: 'string' } } },
  [],
  async (args, ctx) => {
    const dirs = Array.isArray(args.dirs) ? (args.dirs as string[]) : undefined;
    return jsonResult(lintPerfInProject(ctx.projectRoot, { dirs }));
  },
);

export const platformMatrixTool = tool(
  'platform_matrix',
  'Run minigame package limits across wechat/douyin/alipay/huawei',
  {},
  [],
  async (_args, ctx) => jsonResult(runPlatformMatrix(ctx.projectRoot)),
);

export const shaderLintTool = tool(
  'shader_lint',
  'Lint shaders for mobile / cross-platform issues',
  {},
  [],
  async (_args, ctx) => jsonResult(lintShadersInProject(ctx.projectRoot)),
);

export const shaderTranslateTool = tool(
  'shader_translate',
  'Best-effort shader translation between HLSL and GLSL',
  {
    path: { type: 'string' },
    target: { type: 'string', enum: ['hlsl', 'glsl', 'metal', 'wgsl'] },
  },
  ['path', 'target'],
  async (args, ctx) => {
    const rel = args.path as string;
    const abs = join(ctx.projectRoot, rel);
    if (!existsSync(abs)) return jsonResult({ error: 'file not found' }, true);
    const source = readFileSync(abs, 'utf8');
    const result = translateShader(source, args.target as ShaderTarget, rel);
    return jsonResult(result);
  },
);

export const materialAuditTool = tool(
  'material_audit',
  'Audit materials for keyword explosion and multi-pass overdraw',
  {},
  [],
  async (_args, ctx) => jsonResult(auditMaterials(ctx.projectRoot)),
);

export const profileCaptureTool = tool(
  'profile_capture',
  'Plan or run engine profile capture (use --exec in CLI for real Unity)',
  { exec: { type: 'boolean' } },
  [],
  async (args, ctx) =>
    jsonResult(planProfileCapture(ctx.projectRoot, ctx.config, { exec: args.exec === true })),
);

export const profileAnalyzeTool = tool(
  'profile_analyze',
  'Analyze profiler JSON into agent-friendly slices',
  { path: { type: 'string' } },
  ['path'],
  async (args, ctx) => {
    const abs = join(ctx.projectRoot, args.path as string);
    const raw = JSON.parse(readFileSync(abs, 'utf8'));
    return jsonResult(analyzeProfileJson(raw, args.path as string));
  },
);

export const frameBudgetCheckTool = tool(
  'frame_budget_check',
  'Check profile analysis against a target FPS budget',
  { path: { type: 'string' }, target_fps: { type: 'number' } },
  ['path', 'target_fps'],
  async (args, ctx) => {
    const abs = join(ctx.projectRoot, args.path as string);
    const analysis = analyzeProfileJson(JSON.parse(readFileSync(abs, 'utf8')));
    return jsonResult(checkFrameBudget(analysis, Number(args.target_fps)));
  },
);

export const atlasPackTool = tool(
  'atlas_pack',
  'Pack sprites from a directory into a staged Cocos plist atlas manifest',
  {
    dir: { type: 'string' },
    out: { type: 'string' },
  },
  ['dir', 'out'],
  async (args, ctx) => {
    const sprites = spritesFromDirectory(ctx.projectRoot, args.dir as string);
    const result = stageAtlasManifest(ctx.projectRoot, args.out as string, sprites);
    return jsonResult(result);
  },
  { mutates: true, planModeAllowed: false },
);

export const spineImportTool = tool(
  'spine_import',
  'Import Spine JSON to staged prefab placeholder',
  { path: { type: 'string' }, engine: { type: 'string', enum: ['cocos', 'unity'] } },
  ['path'],
  async (args, ctx) =>
    jsonResult(
      importSpineToStaging(
        ctx.projectRoot,
        args.path as string,
        (args.engine as 'unity' | undefined) ?? 'cocos',
      ),
    ),
  { mutates: true, planModeAllowed: false },
);

export const dragonbonesImportTool = tool(
  'dragonbones_import',
  'Import DragonBones JSON to staged prefab placeholder',
  { path: { type: 'string' } },
  ['path'],
  async (args, ctx) => jsonResult(importDragonBonesToStaging(ctx.projectRoot, args.path as string)),
  { mutates: true, planModeAllowed: false },
);

export const lottieImportTool = tool(
  'lottie_import',
  'Import Lottie JSON to staged UI asset',
  { path: { type: 'string' } },
  ['path'],
  async (args, ctx) => jsonResult(importLottieToStaging(ctx.projectRoot, args.path as string)),
  { mutates: true, planModeAllowed: false },
);

export const tilemapImportTool = tool(
  'tilemap_import',
  'Parse Tiled TMX into unified tilemap IR',
  { path: { type: 'string' } },
  ['path'],
  async (args, ctx) => jsonResult(importTmxFile(ctx.projectRoot, args.path as string)),
);

export const balanceConvertTool = tool(
  'balance_convert',
  'Convert balance CSV ↔ JSON',
  { path: { type: 'string' }, to: { type: 'string', enum: ['json', 'csv'] } },
  ['path', 'to'],
  async (args, ctx) => {
    const abs = join(ctx.projectRoot, args.path as string);
    const text = readFileSync(abs, 'utf8');
    const rel = args.path as string;
    const rows = rel.endsWith('.json') ? jsonToBalance(text) : csvToBalance(text);
    const out = args.to === 'csv' ? balanceToCsv(rows) : balanceToJson(rows);
    return jsonResult({ rows: rows.length, preview: out.slice(0, 500) });
  },
);

export const balanceDiffTool = tool(
  'balance_diff',
  'Diff two balance tables by id column',
  { a: { type: 'string' }, b: { type: 'string' }, id_key: { type: 'string' } },
  ['a', 'b'],
  async (args, ctx) => {
    const readRows = (rel: string) => {
      const t = readFileSync(join(ctx.projectRoot, rel), 'utf8');
      return rel.endsWith('.json') ? jsonToBalance(t) : csvToBalance(t);
    };
    return jsonResult(
      diffBalance(
        readRows(args.a as string),
        readRows(args.b as string),
        (args.id_key as string) ?? 'id',
      ),
    );
  },
);

export const difficultySuggestTool = tool(
  'difficulty_suggest',
  'Suggest next level combat stats from prior levels',
  { levels: { type: 'array' } },
  ['levels'],
  async (args) =>
    jsonResult(suggestNextLevel((args.levels as LevelMetrics[]) ?? [], 'exponential-soft')),
);

export const playtestRecordTool = tool(
  'playtest_record',
  'Create a playtest session JSON file under .spark-cli/playtests/',
  { scene: { type: 'string' }, seed: { type: 'number' } },
  [],
  async (args, ctx) => {
    const session = createPlaytestSession({
      engine: detectEngine(ctx.projectRoot, ctx.config.project?.engine).id,
      scene: (args.scene as string) ?? 'assets/scenes/main.scene',
      rngSeed: typeof args.seed === 'number' ? args.seed : 42,
    });
    const rel = `.spark-cli/playtests/session-${Date.now()}.json`;
    const abs = join(ctx.projectRoot, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, serializePlaytestSession(session), 'utf8');
    return jsonResult({ path: rel, session });
  },
  { mutates: true, planModeAllowed: false },
);

export const playtestReplayTool = tool(
  'playtest_replay',
  'Replay a playtest session (deterministic mock in CI)',
  { path: { type: 'string' }, expected_hash: { type: 'string' } },
  ['path'],
  async (args, ctx) => {
    const raw = readFileSync(join(ctx.projectRoot, args.path as string), 'utf8');
    return jsonResult(
      replayPlaytestSession(
        parsePlaytestSession(raw),
        args.expected_hash as string | undefined,
      ),
    );
  },
);

export const playtestCompareTool = tool(
  'playtest_compare',
  'Compare two playtest final state hashes',
  { a: { type: 'string' }, b: { type: 'string' } },
  ['a', 'b'],
  async (args) => jsonResult(comparePlaytestHashes(args.a as string, args.b as string)),
);

export const lockStatusTool = tool(
  'lock_status',
  'List active staging file locks',
  {},
  [],
  async (_args, ctx) => jsonResult(listStagingLocks(ctx.projectRoot)),
);

export const farmRunTool = tool(
  'farm_run',
  'Run a sub-agent task with optional staging lock on paths',
  {
    prompt: { type: 'string' },
    lock_paths: { type: 'array', items: { type: 'string' } },
  },
  ['prompt'],
  async (args, ctx) => {
    const owner = `farm-${Date.now()}`;
    const locks = (args.lock_paths as string[]) ?? [];
    if (locks.length) acquireStagingLock(ctx.projectRoot, locks, owner);
    try {
      const result = await runAgentTurnForCli({
        globalOpts: { project: ctx.projectRoot },
        history: [],
        userInput: args.prompt as string,
        writeMode: 'staging',
        mode: 'normal',
        agentId: owner,
        configOverride: ctx.config,
      });
      return jsonResult({ owner, finalContent: result.finalContent, iterations: result.iterations });
    } finally {
      if (locks.length) releaseStagingLock(ctx.projectRoot, owner);
    }
  },
  { mutates: true, planModeAllowed: false },
);

async function bridgeCall(ctx: ToolContext, method: string, params: Record<string, unknown>) {
  const port = ctx.config.mcp?.port ?? 17321;
  return bridgeRequest(method, params, { port });
}

export const editorPlaymodeStartTool = tool(
  'editor_playmode_start',
  'Start editor play mode (Cocos bridge)',
  {},
  [],
  async (_args, ctx) => {
    if (detectEngine(ctx.projectRoot, ctx.config.project?.engine).id !== 'cocos-creator') {
      return jsonResult({ error: 'Cocos project required' }, true);
    }
    return jsonResult(await bridgeCall(ctx, 'playmode.start', {}));
  },
);

export const editorPlaymodeStopTool = tool(
  'editor_playmode_stop',
  'Stop editor play mode (Cocos bridge)',
  {},
  [],
  async (_args, ctx) => {
    if (detectEngine(ctx.projectRoot, ctx.config.project?.engine).id !== 'cocos-creator') {
      return jsonResult({ error: 'Cocos project required' }, true);
    }
    return jsonResult(await bridgeCall(ctx, 'playmode.stop', {}));
  },
);

export const editorConsoleTailTool = tool(
  'editor_console_tail',
  'Tail recent editor console messages (Cocos bridge)',
  { limit: { type: 'number' } },
  [],
  async (args, ctx) => {
    if (detectEngine(ctx.projectRoot, ctx.config.project?.engine).id !== 'cocos-creator') {
      return jsonResult({ error: 'Cocos project required' }, true);
    }
    return jsonResult(
      await bridgeCall(ctx, 'console.tail', { limit: typeof args.limit === 'number' ? args.limit : 20 }),
    );
  },
);

export const assetGenerateImageTool = tool(
  'asset_generate_image',
  'Generate a placeholder/game icon image into staging (opt-in via tools.gen.image)',
  { prompt: { type: 'string' }, out_path: { type: 'string' } },
  ['prompt', 'out_path'],
  async (args, ctx) => {
    if (!isImageGenEnabled(ctx.config) && ctx.config.tools?.gen?.image?.provider !== 'mock') {
      return jsonResult({ error: 'tools.gen.image.enabled required' }, true);
    }
    return jsonResult(
      await generateImageAsset(ctx.projectRoot, ctx.config, {
        prompt: args.prompt as string,
        outPath: args.out_path as string,
      }),
    );
  },
  { mutates: true, planModeAllowed: false },
);

export const assetGenerateAudioTool = tool(
  'asset_generate_audio',
  'Generate placeholder SFX into staging (opt-in via tools.gen.audio)',
  { prompt: { type: 'string' }, out_path: { type: 'string' } },
  ['prompt', 'out_path'],
  async (args, ctx) => {
    if (!isAudioGenEnabled(ctx.config)) {
      return jsonResult({ error: 'tools.gen.audio.enabled required' }, true);
    }
    return jsonResult(
      await generateAudioAsset(ctx.projectRoot, ctx.config, {
        prompt: args.prompt as string,
        outPath: args.out_path as string,
      }),
    );
  },
  { mutates: true, planModeAllowed: false },
);

export function buildPhase14Tools(): RegisteredTool[] {
  return [
    perfLintTool,
    platformMatrixTool,
    shaderLintTool,
    shaderTranslateTool,
    materialAuditTool,
    profileCaptureTool,
    profileAnalyzeTool,
    frameBudgetCheckTool,
    atlasPackTool,
    spineImportTool,
    dragonbonesImportTool,
    lottieImportTool,
    tilemapImportTool,
    balanceConvertTool,
    balanceDiffTool,
    difficultySuggestTool,
    playtestRecordTool,
    playtestReplayTool,
    playtestCompareTool,
    lockStatusTool,
    farmRunTool,
    editorPlaymodeStartTool,
    editorPlaymodeStopTool,
    editorConsoleTailTool,
    assetGenerateImageTool,
    assetGenerateAudioTool,
  ];
}
