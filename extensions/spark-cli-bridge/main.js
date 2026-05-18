'use strict';

/**
 * Cocos Creator 3.8+ extension — Editor Bridge (Phase 3 prototype).
 * Listens on ws://127.0.0.1:17321 (override with SPARK_CLI_BRIDGE_PORT).
 *
 * Install: copy/symlink this folder to <project>/extensions/spark-cli-bridge
 * then enable in Extension Manager. Run `npm install` inside this folder once.
 */

const WebSocket = require('ws');

const DEFAULT_PORT = 17321;
let wss = null;

function getPort() {
  const env = process.env.SPARK_CLI_BRIDGE_PORT;
  if (env) {
    const n = Number(env);
    if (!Number.isNaN(n)) return n;
  }
  return DEFAULT_PORT;
}

async function openScene(relativePath) {
  const dbUrl = relativePath.startsWith('db://')
    ? relativePath
    : `db://assets/${relativePath.replace(/^assets\//, '')}`;

  const uuid = await Editor.Message.request('asset-db', 'query-uuid', dbUrl);
  if (!uuid) {
    throw new Error(`Asset not found: ${dbUrl}`);
  }
  await Editor.Message.request('scene', 'open-scene', uuid);
  return { opened: relativePath, uuid };
}

async function getSelection() {
  const nodes = await Editor.Message.request('selection', 'query-selected', 'node');
  return { nodes: nodes ?? [] };
}

const consoleBuffer = [];

function pushConsole(level, message) {
  consoleBuffer.push({ t: Date.now(), level, message: String(message) });
  if (consoleBuffer.length > 200) consoleBuffer.shift();
}

async function playmodeStart() {
  await Editor.Message.request('scene', 'enter-prefab-edit-mode', null).catch(() => undefined);
  return { running: true };
}

async function playmodeStop() {
  return { running: false };
}

function consoleTail(limit) {
  const n = Math.min(limit || 20, consoleBuffer.length);
  return { lines: consoleBuffer.slice(-n) };
}

async function handleRequest(msg) {
  const { method, params = {} } = msg;
  if (method === 'scene.open') {
    return { ok: true, result: await openScene(params.path) };
  }
  if (method === 'selection.get') {
    return { ok: true, result: await getSelection() };
  }
  if (method === 'playmode.start') {
    return { ok: true, result: await playmodeStart() };
  }
  if (method === 'playmode.stop') {
    return { ok: true, result: await playmodeStop() };
  }
  if (method === 'console.tail') {
    return { ok: true, result: consoleTail(params.limit) };
  }
  return { ok: false, error: `Unknown method: ${method}` };
}

exports.load = function () {
  const port = getPort();
  wss = new WebSocket.Server({ host: '127.0.0.1', port });

  wss.on('connection', (socket) => {
    socket.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        socket.send(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        return;
      }
      const id = msg.id;
      try {
        const res = await handleRequest(msg);
        socket.send(JSON.stringify({ ...res, id }));
      } catch (e) {
        socket.send(
          JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            id,
          }),
        );
      }
    });
  });

  console.log(`[spark-cli-bridge] listening on ws://127.0.0.1:${port}`);
};

exports.unload = function () {
  if (wss) {
    wss.close();
    wss = null;
  }
};
