import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInit } from './commands/init.js';
import { runConfigInit, runConfigShow } from './commands/config-cmd.js';
import { runDoctor } from './commands/doctor.js';
import {
  runModelCurrent,
  runModelList,
  runModelTest,
  runModelUse,
} from './commands/model.js';
import { runChat } from './commands/chat.js';
import { runGen } from './commands/gen.js';
import { runUi } from './commands/ui.js';
import {
  runSceneAnalyze,
  runSceneList,
  runSceneOpen,
  runSceneOptimize,
} from './commands/scene.js';
import {
  runKnowledgeAdd,
  runKnowledgeIndex,
  runKnowledgeSearch,
} from './commands/knowledge.js';
import { runMemoryAdd, runMemoryClear, runMemoryShow } from './commands/memory.js';
import { runMcpServe } from './commands/mcp-cmd.js';
import {
  runBuildAnalyze,
  runBuildSuggestSplit,
  runBuildWechat,
  runBuildGodot,
  runBuildUnreal,
} from './commands/build.js';
import { runAdaptPlatform } from './commands/adapt.js';
import { runPublishPlatform } from './commands/publish-cmd.js';
import {
  runAssetAnalyze,
  runAssetImport,
  runAssetList,
  runAssetUnused,
  runAssetAudit,
  runAssetFix,
} from './commands/asset.js';
import { runDiff, runApply, runRevert } from './commands/staging-cmd.js';
import { runValidate } from './commands/validate.js';
import { runValidatePerf } from './commands/validate-perf.js';
import { runAdaptMatrix } from './commands/adapt-matrix.js';
import {
  runProfileAnalyze,
  runProfileBudget,
  runProfileCapture,
} from './commands/profile.js';
import {
  runPlaytestCompare,
  runPlaytestRecord,
  runPlaytestReplay,
} from './commands/playtest.js';
import { runAgentFarm } from './commands/agent-farm.js';
import { runShaderLint, runShaderTranslate } from './commands/shader-cmd.js';
import { runAssetGenerateIcon } from './commands/asset-gen.js';
import { runReplayExport } from './commands/replay.js';
import {
  runPluginInstall,
  runPluginList,
  runPluginUninstall,
} from './commands/plugin.js';
import { runLevelNew, runLevelEdit, runLevelShow } from './commands/level.js';
import { runAnimNew, runAnimExport, runAnimShow } from './commands/anim.js';
import { runEditorServe } from './commands/editor-cmd.js';
import { runShell } from './commands/shell.js';
import {
  runWorktreeAdd,
  runWorktreeList,
  runWorktreeRemove,
} from './commands/worktree.js';
import {
  runCronAdd,
  runCronList,
  runCronRemove,
  runCronTick,
} from './commands/cron.js';
import {
  runCloudLogin,
  runCloudLogout,
  runCloudKeysSet,
  runCloudKeysList,
  runCloudKeysUse,
  runCloudPush,
  runCloudPull,
  runCloudServe,
  runCloudStatus,
} from './commands/cloud-cmd.js';
import { exitWithError } from './utils/errors.js';
import type { GlobalOptions } from './utils/output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { version: string };

function collectGlobals(cmd: Command): GlobalOptions {
  const o = cmd.optsWithGlobals();
  return {
    project: o.project,
    config: o.config,
    provider: o.provider,
    model: o.model,
    json: o.json,
    verbose: o.verbose,
    yes: o.yes,
    dryRun: o.dryRun,
  };
}

const program = new Command();

program
  .name('spark-cli')
  .description('AI CLI for game developers — run without subcommand for interactive mode')
  .version(pkg.version)
  .option('-P, --project <path>', 'project root directory', process.cwd())
  .option('-c, --config <path>', 'config file path')
  .option('--provider <name>', 'LLM provider for this command')
  .option('-m, --model <id>', 'LLM model id for this command')
  .option('--json', 'machine-readable JSON output')
  .option('--verbose', 'verbose logging')
  .option('-y, --yes', 'skip confirmation prompts')
  .option('--dry-run', 'do not write to disk')
  .option('--auto', 'tools write directly to project tree (only used in interactive mode)');

const configCmd = program.command('config').description('manage SparkCLI configuration');

configCmd
  .command('init')
  .description('interactive setup for global or project config')
  .action(async function (this: Command) {
    try {
      await runConfigInit(collectGlobals(this.parent as Command));
    } catch (e) {
      exitWithError(e);
    }
  });

configCmd
  .command('show')
  .description('show global config path and model defaults')
  .action(async function (this: Command) {
    await runConfigShow(collectGlobals(this.parent as Command));
  });

program
  .command('init')
  .description('initialize SparkCLI config in the current project')
  .option('--engine <id>', 'cocos-creator | unity | unreal | godot')
  .action(async function (this: Command, opts: { engine?: string }) {
    const engine = opts.engine as
      | 'cocos-creator'
      | 'unity'
      | 'unreal'
      | 'godot'
      | undefined;
    await runInit(collectGlobals(this), engine);
  });

program
  .command('doctor')
  .description('check environment, config, and model credentials')
  .action(async function (this: Command) {
    const code = await runDoctor(collectGlobals(this));
    process.exitCode = code;
  });

const modelCmd = program.command('model').description('manage LLM provider and model');

modelCmd
  .command('list')
  .description('list built-in providers and example models')
  .option('--provider <id>', 'filter by provider id')
  .action(async function (this: Command, opts: { provider?: string }) {
    await runModelList(collectGlobals(this.parent as Command), opts.provider);
  });

modelCmd
  .command('current')
  .description('show current default model')
  .action(async function (this: Command) {
    await runModelCurrent(collectGlobals(this.parent as Command));
  });

modelCmd
  .command('use [ref]')
  .description('set default model, e.g. openai/gpt-4o')
  .option('--provider <name>', 'provider name')
  .option('-m, --model <id>', 'model id')
  .action(async function (
    this: Command,
    ref: string | undefined,
    opts: { provider?: string; model?: string },
  ) {
    await runModelUse(collectGlobals(this.parent as Command), ref, opts);
  });

modelCmd
  .command('test')
  .description('verify credentials for current model')
  .action(async function (this: Command) {
    await runModelTest(collectGlobals(this.parent as Command));
  });

program
  .command('chat [prompt...]')
  .description('chat with AI (no prompt = interactive session)')
  .option('--auto', 'tools write directly to project tree (default: staging)')
  .option('--no-mascot', 'hide Spark welcome mascot')
  .action(async function (
    this: Command,
    parts: string[],
    opts: { auto?: boolean; noMascot?: boolean },
  ) {
    const prompt = parts.join(' ');
    const globals = collectGlobals(this);
    if (!prompt) {
      await runShell(globals, { auto: opts.auto, noMascot: opts.noMascot });
      return;
    }
    await runChat(globals, prompt, { auto: opts.auto });
  });

program
  .command('shell', { isDefault: true })
  .description('interactive session (default when you run spark-cli with no subcommand)')
  .option('--auto', 'tools write directly to project tree (default: staging)')
  .option('--no-mascot', 'hide Spark welcome mascot')
  .action(async function (this: Command, opts: { auto?: boolean; noMascot?: boolean }) {
    const globals = collectGlobals(this);
    const parent = this.parent?.opts() as { auto?: boolean; noMascot?: boolean } | undefined;
    const auto = opts.auto ?? parent?.auto;
    const noMascot = opts.noMascot ?? parent?.noMascot;
    await runShell(globals, { auto, noMascot });
  });

program
  .command('gen [prompt...]')
  .description('generate game logic or components via AI')
  .option('--type <type>', 'component | system | ai')
  .option('--template', 'use built-in engine template (default for unreal/godot)')
  .action(async function (
    this: Command,
    parts: string[],
    opts: { type?: string; template?: boolean },
  ) {
    const prompt = parts.join(' ') || 'sample component';
    await runGen(collectGlobals(this), prompt, opts.type, opts.template);
  });

program
  .command('diff')
  .description('show staged file diffs')
  .action(function (this: Command) {
    runDiff(collectGlobals(this));
  });

program
  .command('apply')
  .description('apply staged changes to the project')
  .action(function (this: Command) {
    runApply(collectGlobals(this));
  });

program
  .command('revert')
  .description('discard staged changes')
  .action(function (this: Command) {
    runRevert(collectGlobals(this));
  });

program
  .command('validate')
  .description('run project validation (tsc, cocos layout)')
  .option('--perf', 'run performance / memory lint on game scripts')
  .action(async function (this: Command, opts: { perf?: boolean }) {
    const globals = collectGlobals(this);
    if (opts.perf) {
      process.exitCode = await runValidatePerf(globals);
      return;
    }
    process.exitCode = await runValidate(globals);
  });

const sceneCmd = program.command('scene').description('Cocos scene operations');

sceneCmd
  .command('list')
  .description('list .scene files under assets/')
  .action(function (this: Command) {
    runSceneList(collectGlobals(this.parent as Command));
  });

sceneCmd
  .command('analyze <path>')
  .description('analyze a scene file (node tree, components)')
  .action(function (this: Command, scenePath: string) {
    runSceneAnalyze(collectGlobals(this.parent as Command), scenePath);
  });

sceneCmd
  .command('optimize <path>')
  .description('static optimization suggestions for a scene')
  .action(function (this: Command, scenePath: string) {
    runSceneOptimize(collectGlobals(this.parent as Command), scenePath);
  });

sceneCmd
  .command('open <path>')
  .description('open scene in Cocos Editor via spark-cli-bridge WebSocket')
  .action(async function (this: Command, scenePath: string) {
    await runSceneOpen(collectGlobals(this.parent as Command), scenePath);
  });

const knowledgeCmd = program.command('knowledge').description('local knowledge base');

knowledgeCmd
  .command('index')
  .description('build knowledge index from bundled + project markdown')
  .action(function (this: Command) {
    runKnowledgeIndex(collectGlobals(this.parent as Command));
  });

knowledgeCmd
  .command('search <query...>')
  .description('search indexed knowledge')
  .action(function (this: Command, parts: string[]) {
    runKnowledgeSearch(collectGlobals(this.parent as Command), parts.join(' '));
  });

knowledgeCmd
  .command('add <file>')
  .description('copy a markdown file into .spark-cli/knowledge/')
  .option('-t, --title <name>', 'destination base name')
  .action(function (this: Command, file: string, opts: { title?: string }) {
    runKnowledgeAdd(collectGlobals(this.parent as Command), file, opts.title);
  });

const memoryCmd = program.command('memory').description('project and session memory');

memoryCmd
  .command('show')
  .description('show stored memory')
  .action(function (this: Command) {
    runMemoryShow(collectGlobals(this.parent as Command));
  });

memoryCmd
  .command('add <key> <value...>')
  .description('add project memory entry')
  .action(function (this: Command, key: string, valueParts: string[]) {
    runMemoryAdd(collectGlobals(this.parent as Command), key, valueParts.join(' '));
  });

memoryCmd
  .command('clear [scope]')
  .description('clear memory: session | project | all (default all)')
  .action(function (this: Command, scope?: string) {
    runMemoryClear(collectGlobals(this.parent as Command), scope);
  });

program
  .command('ui [prompt...]')
  .description('generate UI scripts via AI (optional design input)')
  .option('--image <path>', 'reference screenshot (uses tasks.vision model)')
  .option('--figma <url>', 'Figma file URL (requires FIGMA_TOKEN)')
  .option('--sketch <file>', 'Sketch exported JSON layout')
  .action(async function (
    this: Command,
    parts: string[],
    opts: { image?: string; figma?: string; sketch?: string },
  ) {
    const globals = collectGlobals(this);
    try {
      await runUi(
        { ...globals, image: opts.image, figma: opts.figma, sketch: opts.sketch },
        parts.join(' '),
      );
    } catch (e) {
      exitWithError(e);
    }
  });

const buildCmd = program.command('build').description('build and analyze WeChat packages');

buildCmd
  .command('wechat')
  .description('build Cocos project for WeChat minigame (requires Cocos Creator)')
  .action(async function (this: Command) {
    const code = await runBuildWechat(collectGlobals(this.parent as Command));
    process.exitCode = code;
  });

buildCmd
  .command('analyze')
  .description('analyze build/wechatgame sizes vs official limits')
  .action(function (this: Command) {
    const code = runBuildAnalyze(collectGlobals(this.parent as Command));
    process.exitCode = code;
  });

buildCmd
  .command('suggest-split')
  .description('suggest WeChat subpackage roots from assets/scenes')
  .action(function (this: Command) {
    runBuildSuggestSplit(collectGlobals(this.parent as Command));
  });

buildCmd
  .command('godot')
  .description('plan Godot export (requires export preset)')
  .option('--platform <name>', 'web | windows | linux', 'web')
  .action(function (this: Command, opts: { platform: string }) {
    const code = runBuildGodot(collectGlobals(this.parent as Command), opts.platform);
    process.exitCode = code;
  });

buildCmd
  .command('unreal')
  .description('plan Unreal UBT build command')
  .option('--target <name>', 'Development | Shipping', 'Development')
  .action(function (this: Command, opts: { target: string }) {
    const code = runBuildUnreal(collectGlobals(this.parent as Command), opts.target);
    process.exitCode = code;
  });

const adaptCmd = program.command('adapt').description('platform adaptation checks');

function registerAdaptPlatform(platform: 'wechat' | 'douyin' | 'alipay' | 'huawei', description: string) {
  adaptCmd
    .command(platform)
    .description(description)
    .option('--fix', 'write adapt report to .spark-cli/')
    .action(async function (this: Command, opts: { fix?: boolean }) {
      const code = await runAdaptPlatform(platform, {
        ...collectGlobals(this.parent as Command),
        fix: opts.fix,
      });
      process.exitCode = code;
    });
}

registerAdaptPlatform('wechat', 'WeChat minigame compliance');
registerAdaptPlatform('douyin', 'Douyin (ByteDance) minigame compliance');
registerAdaptPlatform('alipay', 'Alipay minigame compliance');
registerAdaptPlatform('huawei', 'Huawei Quick Game compliance');

adaptCmd
  .command('matrix')
  .description('cross-platform package limits matrix (wechat/douyin/alipay/huawei)')
  .action(async function (this: Command) {
    process.exitCode = await runAdaptMatrix(collectGlobals(this.parent as Command));
  });

const publishCmd = program.command('publish').description('publish to platforms');

function registerPublishPlatform(
  platform: 'wechat' | 'douyin' | 'alipay' | 'huawei',
  description: string,
) {
  publishCmd
    .command(platform)
    .description(description)
    .option('--env <env>', 'preview or production', 'preview')
    .action(async function (this: Command, opts: { env: string }) {
      const env = opts.env === 'production' ? 'production' : 'preview';
      const code = await runPublishPlatform(
        platform,
        collectGlobals(this.parent as Command),
        env,
      );
      process.exitCode = code;
    });
}

registerPublishPlatform('wechat', 'upload via WeChat DevTools CLI');
registerPublishPlatform('douyin', 'upload via Douyin minigame CI (skeleton)');
registerPublishPlatform('alipay', 'upload via Alipay miniprogram CI (skeleton)');
registerPublishPlatform('huawei', 'upload via Huawei fastapp CLI (skeleton)');

const assetCmd = program.command('asset').description('project asset utilities');

assetCmd
  .command('list')
  .description('list files under assets/')
  .option('--type <type>', 'texture|prefab|audio|script|scene')
  .action(function (this: Command, opts: { type?: string }) {
    runAssetList(collectGlobals(this.parent as Command), opts.type);
  });

assetCmd
  .command('analyze')
  .description('asset size breakdown and largest files')
  .action(function (this: Command) {
    runAssetAnalyze(collectGlobals(this.parent as Command));
  });

assetCmd
  .command('unused')
  .description('heuristic unused asset scan')
  .action(function (this: Command) {
    runAssetUnused(collectGlobals(this.parent as Command));
  });

assetCmd
  .command('import <source>')
  .description('copy a file into the project')
  .requiredOption('--to <path>', 'destination relative path e.g. assets/textures/icon.png')
  .action(function (this: Command, source: string, opts: { to: string }) {
    runAssetImport(collectGlobals(this.parent as Command), source, opts.to);
  });

assetCmd
  .command('audit')
  .description('lint texture/audio/unused-asset issues under assets/')
  .option('--dir <dir>', 'subdirectory to scan (default: assets)')
  .option('--disable <rules>', 'comma-separated rule ids to skip')
  .action(function (this: Command, opts: { dir?: string; disable?: string }) {
    runAssetAudit(collectGlobals(this.parent as Command), opts);
  });

assetCmd
  .command('fix')
  .description('apply automatic remediations for matching audit rules (stages changes)')
  .requiredOption('--rule <id>', 'rule id from `spark-cli asset audit`')
  .option('--apply', 'stage the fix; without this flag a dry-run plan is printed')
  .option('--dir <dir>', 'subdirectory to scan (default: assets)')
  .action(function (this: Command, opts: { rule: string; apply?: boolean; dir?: string }) {
    runAssetFix(collectGlobals(this.parent as Command), opts);
  });

assetCmd
  .command('generate-icon <prompt...>')
  .description('generate placeholder icon into staging (tools.gen.image)')
  .option('--size <size>', 'e.g. 64x64', '64x64')
  .option('--out <path>', 'output path under project', 'assets/textures/generated-icon.svg')
  .action(async function (this: Command, parts: string[], opts: { size?: string; out?: string }) {
    const code = await runAssetGenerateIcon(
      collectGlobals(this.parent as Command),
      parts.join(' '),
      opts,
    );
    process.exitCode = code;
  });

const profileCmd = program.command('profile').description('performance profiling');

profileCmd
  .command('capture')
  .description('plan engine profile capture')
  .option('--exec', 'attempt real Unity batch capture when configured')
  .action(async function (this: Command, opts: { exec?: boolean }) {
    process.exitCode = await runProfileCapture(collectGlobals(this.parent as Command), opts);
  });

profileCmd
  .command('analyze <file>')
  .description('analyze profiler JSON')
  .action(async function (this: Command, file: string) {
    process.exitCode = await runProfileAnalyze(collectGlobals(this.parent as Command), file);
  });

profileCmd
  .command('budget <file>')
  .description('check profile against frame budget')
  .option('--fps <n>', 'target FPS', '60')
  .action(async function (this: Command, file: string, opts: { fps: string }) {
    process.exitCode = await runProfileBudget(
      collectGlobals(this.parent as Command),
      file,
      Number(opts.fps),
    );
  });

const playtestCmd = program.command('playtest').description('gameplay replay / smoke');

playtestCmd
  .command('record [scene]')
  .description('create playtest session file')
  .action(async function (this: Command, scene?: string) {
    process.exitCode = await runPlaytestRecord(collectGlobals(this.parent as Command), scene);
  });

playtestCmd
  .command('replay <file>')
  .description('replay playtest session')
  .option('--hash <hex>', 'expected final state hash')
  .action(async function (this: Command, file: string, opts: { hash?: string }) {
    process.exitCode = await runPlaytestReplay(
      collectGlobals(this.parent as Command),
      file,
      opts.hash,
    );
  });

playtestCmd
  .command('compare <a> <b>')
  .description('compare two playtest hashes')
  .action(async function (this: Command, a: string, b: string) {
    process.exitCode = await runPlaytestCompare(collectGlobals(this.parent as Command), a, b);
  });

const agentCmd = program.command('agent').description('multi-agent workflows');

agentCmd
  .command('farm <plan>')
  .description('run parallel sub-agents from a YAML plan')
  .action(async function (this: Command, plan: string) {
    process.exitCode = await runAgentFarm(collectGlobals(this.parent as Command), plan);
  });

const shaderCmd = program.command('shader').description('shader lint and translation');

shaderCmd
  .command('lint')
  .description('lint project shaders')
  .action(async function (this: Command) {
    process.exitCode = await runShaderLint(collectGlobals(this.parent as Command));
  });

shaderCmd
  .command('translate <file>')
  .description('translate a shader file')
  .requiredOption('--target <t>', 'hlsl|glsl|metal|wgsl')
  .action(async function (this: Command, file: string, opts: { target: string }) {
    process.exitCode = await runShaderTranslate(
      collectGlobals(this.parent as Command),
      file,
      opts.target as 'hlsl' | 'glsl' | 'metal' | 'wgsl',
    );
  });

const mcpCmd = program.command('mcp').description('Model Context Protocol server');

mcpCmd
  .command('serve')
  .description('start MCP server on stdio (for Cursor / Claude Desktop)')
  .action(async function () {
    await runMcpServe();
  });

const replayCmd = program.command('replay').description('export session replay bundles');

replayCmd
  .command('export [file]')
  .description('write replay.json (prompt log, staging diff, validate history)')
  .action(async function (this: Command, file?: string) {
    await runReplayExport(collectGlobals(this.parent as Command), file);
  });

const pluginCmd = program.command('plugin').description('install local SparkCLI plugins');

pluginCmd
  .command('list')
  .description('list plugins in .spark-cli/plugins/')
  .action(function (this: Command) {
    runPluginList(collectGlobals(this.parent as Command));
  });

pluginCmd
  .command('install <path>')
  .description('copy a plugin folder (must contain spark-cli-plugin.json)')
  .action(function (this: Command, pluginPath: string) {
    runPluginInstall(collectGlobals(this.parent as Command), pluginPath);
  });

pluginCmd
  .command('uninstall <name>')
  .description('remove an installed plugin')
  .action(function (this: Command, name: string) {
    runPluginUninstall(collectGlobals(this.parent as Command), name);
  });

const levelCmd = program.command('level').description('visual level DSL (zones, paths)');

levelCmd
  .command('new <name> [hint...]')
  .description('create level JSON + Cocos loader (template, staged)')
  .option('--out <path>', 'output JSON path')
  .action(async function (
    this: Command,
    name: string,
    hintParts: string[],
    opts: { out?: string },
  ) {
    try {
      await runLevelNew(collectGlobals(this.parent as Command), name, hintParts.join(' '), opts.out);
    } catch (e) {
      exitWithError(e);
    }
  });

levelCmd
  .command('edit <path> [hint...]')
  .description('patch an existing level JSON (staged)')
  .action(async function (this: Command, path: string, hintParts: string[]) {
    try {
      await runLevelEdit(collectGlobals(this.parent as Command), path, hintParts.join(' '));
    } catch (e) {
      exitWithError(e);
    }
  });

levelCmd
  .command('show <path>')
  .description('print level JSON summary')
  .action(function (this: Command, path: string) {
    try {
      runLevelShow(collectGlobals(this.parent as Command), path);
    } catch (e) {
      exitWithError(e);
    }
  });

const animCmd = program.command('anim').description('animation state machine DSL');

animCmd
  .command('new <name> [spec...]')
  .description('create anim graph JSON + controller script (staged)')
  .option('--out <path>', 'output JSON path')
  .action(async function (
    this: Command,
    name: string,
    specParts: string[],
    opts: { out?: string },
  ) {
    try {
      await runAnimNew(collectGlobals(this.parent as Command), name, specParts.join(' '), opts.out);
    } catch (e) {
      exitWithError(e);
    }
  });

animCmd
  .command('show <path>')
  .description('print anim graph summary')
  .action(function (this: Command, path: string) {
    try {
      runAnimShow(collectGlobals(this.parent as Command), path);
    } catch (e) {
      exitWithError(e);
    }
  });

animCmd
  .command('export <path>')
  .description('export runtime anim bundle for Cocos')
  .option('--format <fmt>', 'cocos', 'cocos')
  .action(async function (this: Command, path: string, opts: { format: string }) {
    try {
      await runAnimExport(collectGlobals(this.parent as Command), path, opts.format);
    } catch (e) {
      exitWithError(e);
    }
  });

const editorCmd = program.command('editor').description('local Web UI for level/anim + staging');

editorCmd
  .command('serve')
  .description('start editor on localhost (default port 17323)')
  .option('-p, --port <n>', 'port number', (v) => parseInt(v, 10))
  .action(async function (this: Command, opts: { port?: number }) {
    try {
      await runEditorServe(collectGlobals(this.parent as Command), opts.port);
    } catch (e) {
      exitWithError(e);
    }
  });

const cloudCmd = program.command('cloud').description('SparkCLI Cloud (login, keys, sync)');

cloudCmd
  .command('login')
  .description('log in via device code (mock server: spark-cli cloud serve)')
  .option('--yes', 'auto-approve device code on mock server')
  .action(async function (this: Command) {
    try {
      await runCloudLogin(collectGlobals(this.parent as Command));
    } catch (e) {
      exitWithError(e);
    }
  });

cloudCmd
  .command('logout')
  .description('clear cloud session')
  .action(function (this: Command) {
    runCloudLogout(collectGlobals(this.parent as Command));
  });

cloudCmd
  .command('status')
  .description('show login and proxy status')
  .action(function (this: Command) {
    runCloudStatus(collectGlobals(this.parent as Command));
  });

cloudCmd
  .command('serve')
  .description('start local mock SparkCLI Cloud API (dev)')
  .option('-p, --port <n>', 'port', (v) => parseInt(v, 10))
  .action(async function (this: Command, opts: { port?: number }) {
    try {
      await runCloudServe(collectGlobals(this.parent as Command), opts.port);
    } catch (e) {
      exitWithError(e);
    }
  });

const cloudKeysCmd = cloudCmd.command('keys').description('cloud LLM key vault');

cloudKeysCmd
  .command('set <provider>')
  .description('store provider API key in cloud')
  .option('--key <value>', 'API key value')
  .option('--from-env <name>', 'read key from environment variable')
  .action(async function (
    this: Command,
    provider: string,
    opts: { key?: string; fromEnv?: string },
  ) {
    try {
      const key =
        opts.key ?? (opts.fromEnv ? process.env[opts.fromEnv] : undefined) ??
        process.env[`${provider.toUpperCase()}_API_KEY`] ??
        process.env.OPENAI_API_KEY;
      if (!key) throw new Error('Provide --key or set provider API key env');
      await runCloudKeysSet(
        provider,
        key,
        collectGlobals((this.parent?.parent?.parent ?? this.parent) as Command),
      );
    } catch (e) {
      exitWithError(e);
    }
  });

cloudKeysCmd
  .command('list')
  .description('list keys stored in cloud')
  .action(async function (this: Command) {
    try {
      await runCloudKeysList(
        collectGlobals((this.parent?.parent?.parent ?? this.parent) as Command),
      );
    } catch (e) {
      exitWithError(e);
    }
  });

cloudKeysCmd
  .command('use')
  .description('route LLM calls through cloud proxy')
  .action(function (this: Command) {
    try {
      runCloudKeysUse(collectGlobals((this.parent?.parent?.parent ?? this.parent) as Command));
    } catch (e) {
      exitWithError(e);
    }
  });

cloudKeysCmd
  .command('off')
  .description('disable cloud key proxy')
  .action(function (this: Command) {
    try {
      runCloudKeysUse(
        collectGlobals((this.parent?.parent?.parent ?? this.parent) as Command),
        true,
      );
    } catch (e) {
      exitWithError(e);
    }
  });

cloudCmd
  .command('push')
  .description('upload whitelisted project paths to cloud')
  .action(async function (this: Command) {
    try {
      await runCloudPush(collectGlobals(this.parent as Command));
    } catch (e) {
      exitWithError(e);
    }
  });

cloudCmd
  .command('pull')
  .description('download synced files from cloud')
  .action(async function (this: Command) {
    try {
      await runCloudPull(collectGlobals(this.parent as Command));
    } catch (e) {
      exitWithError(e);
    }
  });

const worktreeCmd = program.command('worktree').description('git worktree helpers (.spark-cli/worktrees/)');
worktreeCmd
  .command('add <name>')
  .option('-b, --branch <branch>', 'branch name (default spark-cli/wt-<name>)')
  .option('--base <ref>', 'base ref when creating a new branch (default HEAD)')
  .description('create a worktree under .spark-cli/worktrees/<name>')
  .action(async function (this: Command, name: string, opts: { branch?: string; base?: string }) {
    try { await runWorktreeAdd(collectGlobals(this.parent as Command), { name, ...opts }); }
    catch (e) { exitWithError(e); }
  });
worktreeCmd
  .command('list')
  .description('list worktrees in this repo')
  .action(async function (this: Command) {
    try { await runWorktreeList(collectGlobals(this.parent as Command)); }
    catch (e) { exitWithError(e); }
  });
worktreeCmd
  .command('remove <name>')
  .option('--force', 'force removal even if dirty')
  .option('--delete-branch', 'also delete the worktree branch')
  .description('remove a worktree under .spark-cli/worktrees/<name>')
  .action(async function (this: Command, name: string, opts: { force?: boolean; deleteBranch?: boolean }) {
    try { await runWorktreeRemove(collectGlobals(this.parent as Command), { name, ...opts }); }
    catch (e) { exitWithError(e); }
  });

const cronCmd = program.command('cron').description('durable cron jobs (~/.spark-cli/cron.json)');
cronCmd
  .command('add <cron> <prompt...>')
  .option('--once', 'fire once and auto-delete')
  .option('--ttl-days <days>', 'auto-expire recurring job after N days', (v) => parseInt(v, 10))
  .description('schedule a job (5-field cron in local time)')
  .action(async function (
    this: Command,
    cron: string,
    promptParts: string[],
    opts: { once?: boolean; ttlDays?: number },
  ) {
    try {
      await runCronAdd(collectGlobals(this.parent as Command), {
        cron,
        prompt: promptParts.join(' '),
        once: opts.once,
        ttlDays: opts.ttlDays,
      });
    } catch (e) { exitWithError(e); }
  });
cronCmd
  .command('list')
  .description('list cron jobs')
  .action(async function (this: Command) {
    try { await runCronList(collectGlobals(this.parent as Command)); }
    catch (e) { exitWithError(e); }
  });
cronCmd
  .command('remove <id>')
  .description('delete a cron job by id')
  .action(async function (this: Command, id: string) {
    try { await runCronRemove(collectGlobals(this.parent as Command), { id }); }
    catch (e) { exitWithError(e); }
  });
cronCmd
  .command('tick')
  .description('fire any jobs due now (call from launchd/Task Scheduler)')
  .action(async function (this: Command) {
    try { await runCronTick(collectGlobals(this.parent as Command)); }
    catch (e) { exitWithError(e); }
  });

async function main(): Promise<void> {
  // `shell` is registered with `{ isDefault: true }` so bare `spark-cli` enters
  // the REPL. Do not call `program.parse([])` without a subcommand — Commander
  // prints help and exits before any action runs.
  await program.parseAsync(process.argv);
}

main().catch((err) => exitWithError(err));
