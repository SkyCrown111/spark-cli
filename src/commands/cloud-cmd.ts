import chalk from 'chalk';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { loadGlobalConfig, loadMergedConfig, saveGlobalConfig } from '../config/load.js';
import { SparkCLIError } from '../utils/errors.js';
import {
  cloudStartDeviceAuth,
  cloudPollDeviceToken,
  cloudSetKey,
  cloudListKeys,
  cloudPushSync,
  cloudPullSync,
} from '../cloud/client.js';
import { getCloudEndpoint } from '../cloud/config.js';
import { saveCloudSession, clearCloudSession, loadCloudSession, isCloudLoggedIn } from '../cloud/session.js';
import { startCloudMockServer } from '../cloud/mock-server.js';
import { collectSyncFiles, projectCloudId } from '../cloud/sync.js';
import { DEFAULT_CLOUD_ENDPOINT } from '../cloud/paths.js';

export async function runCloudLogin(opts: GlobalOptions, autoApprove?: boolean): Promise<void> {
  const global = loadGlobalConfig();
  const endpoint = getCloudEndpoint(global);

  const approve = Boolean(autoApprove || opts.yes || process.env.SPARK_CLI_CLOUD_AUTO_APPROVE === '1');
  const device = await cloudStartDeviceAuth(endpoint, approve);
  if (!approve) {
    console.log(chalk.bold('\nCloud login\n'));
    console.log(`  Visit: ${chalk.cyan(device.verificationUri)}`);
    console.log(`  Code:  ${chalk.yellow(device.userCode)}`);
    console.log(chalk.dim('  Use --yes for mock auto-approve\n'));
  }

  const deadline = Date.now() + device.expiresIn * 1000;
  let session = null;
  while (Date.now() < deadline) {
    session = await cloudPollDeviceToken(device.deviceCode, endpoint);
    if (session) break;
    await new Promise((r) => setTimeout(r, device.interval * 1000));
  }

  if (!session) {
    throw new SparkCLIError('Cloud login timed out', 1, ['Run: spark-cli cloud serve (mock)', 'Then retry with --yes']);
  }

  saveCloudSession(session);
  global.cloud = { ...global.cloud, enabled: true, endpoint };
  saveGlobalConfig(global);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, user: session.user, endpoint }));
  } else {
    console.log(chalk.green('✓'), 'Logged in to SparkCLI Cloud');
    console.log(chalk.dim(`  ${session.user.email ?? session.user.id}`));
  }
}

export function runCloudLogout(opts: GlobalOptions): void {
  clearCloudSession();
  const global = loadGlobalConfig();
  if (global.cloud) {
    global.cloud.useCloudKeys = false;
    saveGlobalConfig(global);
  }
  if (opts.json) console.log(JSON.stringify({ ok: true }));
  else console.log(chalk.green('✓'), 'Logged out (local keys unchanged)');
}

export async function runCloudKeysSet(
  provider: string,
  apiKey: string,
  opts: GlobalOptions,
): Promise<void> {
  const session = loadCloudSession();
  if (!session) {
    throw new SparkCLIError('Not logged in', 1, ['Run: spark-cli cloud login --yes']);
  }
  const global = loadGlobalConfig();
  await cloudSetKey(provider, apiKey, session.accessToken, getCloudEndpoint(global));
  if (opts.json) console.log(JSON.stringify({ ok: true, provider }));
  else console.log(chalk.green('✓'), `Cloud key stored for ${provider}`);
}

export async function runCloudKeysList(opts: GlobalOptions): Promise<void> {
  const session = loadCloudSession();
  if (!session) throw new SparkCLIError('Not logged in', 1);
  const global = loadGlobalConfig();
  const list = await cloudListKeys(session.accessToken, getCloudEndpoint(global));
  if (opts.json) console.log(JSON.stringify(list));
  else {
    console.log(chalk.bold('\nCloud keys\n'));
    for (const k of list.keys) {
      console.log(`  ${chalk.cyan(k.provider)}  ****${k.last4 ?? '????'}  ${chalk.dim(k.setAt)}`);
    }
    if (!list.keys.length) console.log(chalk.dim('  (none — use cloud keys set <provider>)'));
  }
}

export function runCloudKeysUse(opts: GlobalOptions, disable?: boolean): void {
  const global = loadGlobalConfig();
  if (!disable && !isCloudLoggedIn()) {
    throw new SparkCLIError('Not logged in', 1, ['Run: spark-cli cloud login']);
  }
  global.cloud = {
    ...global.cloud,
    enabled: true,
    useCloudKeys: !disable,
    endpoint: global.cloud?.endpoint ?? DEFAULT_CLOUD_ENDPOINT,
  };
  saveGlobalConfig(global);
  if (opts.json) {
    console.log(JSON.stringify({ useCloudKeys: global.cloud.useCloudKeys }));
  } else {
    console.log(
      chalk.green('✓'),
      disable ? 'Cloud key proxy disabled' : 'LLM calls will use SparkCLI Cloud proxy',
    );
  }
}

export async function runCloudPush(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const session = loadCloudSession();
  if (!session) throw new SparkCLIError('Not logged in', 1);

  const files = collectSyncFiles(root, config);
  const projectId = projectCloudId(root);
  const result = await cloudPushSync(
    projectId,
    files,
    session.accessToken,
    getCloudEndpoint(config),
  );

  if (opts.json) console.log(JSON.stringify({ projectId, ...result }));
  else console.log(chalk.green('✓'), `Pushed ${result.count} file(s) — revision ${result.revision}`);
}

export async function runCloudPull(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const session = loadCloudSession();
  if (!session) throw new SparkCLIError('Not logged in', 1);

  const projectId = projectCloudId(root);
  const result = await cloudPullSync(projectId, session.accessToken, getCloudEndpoint(config));

  if (opts.dryRun) {
    if (opts.json) console.log(JSON.stringify({ dryRun: true, count: Object.keys(result.files).length }));
    return;
  }

  for (const [rel, content] of Object.entries(result.files)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }

  if (opts.json) console.log(JSON.stringify({ projectId, revision: result.revision, count: Object.keys(result.files).length }));
  else console.log(chalk.green('✓'), `Pulled ${Object.keys(result.files).length} file(s)`);
}

export async function runCloudServe(opts: GlobalOptions, port?: number): Promise<void> {
  const { port: bound, close } = await startCloudMockServer(port ?? 17400);
  const url = `http://127.0.0.1:${bound}`;
  if (opts.json) console.log(JSON.stringify({ url, port: bound }));
  else {
    console.log(chalk.green('✓'), `SparkCLI Cloud mock at ${chalk.cyan(url)}`);
    console.log(chalk.dim('  Press Ctrl+C to stop'));
  }
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      close();
      resolve();
    });
  });
}

export function runCloudStatus(opts: GlobalOptions): void {
  const session = loadCloudSession();
  const global = loadGlobalConfig();
  const body = {
    loggedIn: Boolean(session),
    user: session?.user,
    useCloudKeys: global.cloud?.useCloudKeys ?? false,
    endpoint: global.cloud?.endpoint ?? DEFAULT_CLOUD_ENDPOINT,
  };
  if (opts.json) console.log(JSON.stringify(body));
  else {
    console.log(chalk.bold('\nCloud status\n'));
    console.log(`  Logged in: ${session ? chalk.green('yes') : chalk.dim('no')}`);
    console.log(`  Proxy keys: ${body.useCloudKeys ? chalk.green('on') : chalk.dim('off')}`);
    console.log(`  Endpoint: ${body.endpoint}`);
  }
}
