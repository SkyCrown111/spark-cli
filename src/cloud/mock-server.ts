import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { request } from 'undici';
import { getCloudDataDir } from './paths.js';
import { DEFAULT_BASE_URLS } from '../core/providers/endpoints.js';

const DEFAULT_PORT = 17400;

interface PendingDevice {
  userCode: string;
  approved: boolean;
  expiresAt: number;
}

interface KeysStore {
  keys: Record<string, { apiKey: string; setAt: string }>;
}

function dataPath(...parts: string[]): string {
  const dir = getCloudDataDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, ...parts);
}

function loadKeys(): KeysStore {
  const path = dataPath('keys.json');
  if (!existsSync(path)) return { keys: {} };
  return JSON.parse(readFileSync(path, 'utf8')) as KeysStore;
}

function saveKeys(store: KeysStore): void {
  writeFileSync(dataPath('keys.json'), JSON.stringify(store, null, 2), 'utf8');
}

const pendingDevices = new Map<string, PendingDevice>();
const tokens = new Map<string, { userId: string; expiresAt: number }>();

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function authToken(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}

function requireAuth(req: IncomingMessage, res: ServerResponse): string | null {
  const token = authToken(req);
  if (!token || !tokens.has(token)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return null;
  }
  const entry = tokens.get(token)!;
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token);
    sendJson(res, 401, { error: 'token_expired' });
    return null;
  }
  return token;
}

function syncDir(projectId: string): string {
  const dir = dataPath('sync', projectId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function startCloudMockServer(port = DEFAULT_PORT): Promise<{
  port: number;
  close: () => void;
}> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const method = req.method ?? 'GET';

    try {
      if (method === 'POST' && url.pathname === '/v1/auth/device') {
        const body = JSON.parse(await readBody(req)) as { auto_approve?: boolean };
        const deviceCode = `dev_${crypto.randomUUID().replace(/-/g, '')}`;
        const userCode = String(Math.floor(100000 + Math.random() * 900000));
        pendingDevices.set(deviceCode, {
          userCode,
          approved: Boolean(body.auto_approve) || process.env.SPARK_CLI_CLOUD_AUTO_APPROVE === '1',
          expiresAt: Date.now() + 600_000,
        });
        sendJson(res, 200, {
          deviceCode,
          userCode,
          verificationUri: `http://127.0.0.1:${port}/device`,
          expiresIn: 600,
          interval: 2,
        });
        return;
      }

      if (method === 'POST' && url.pathname === '/v1/auth/token') {
        const body = JSON.parse(await readBody(req)) as { device_code: string };
        const pending = pendingDevices.get(body.device_code);
        if (!pending || pending.expiresAt < Date.now()) {
          sendJson(res, 400, { error: 'expired_token' });
          return;
        }
        if (!pending.approved) {
          sendJson(res, 400, { error: 'authorization_pending' });
          return;
        }
        const accessToken = `gcli_${crypto.randomUUID().replace(/-/g, '')}`;
        tokens.set(accessToken, { userId: 'user-local', expiresAt: Date.now() + 86_400_000 });
        pendingDevices.delete(body.device_code);
        sendJson(res, 200, {
          accessToken,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: { id: 'user-local', email: 'dev@spark-cli.local' },
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/v1/keys') {
        if (!requireAuth(req, res)) return;
        const store = loadKeys();
        sendJson(res, 200, {
          keys: Object.entries(store.keys).map(([provider, v]) => ({
            provider,
            setAt: v.setAt,
            last4: v.apiKey.slice(-4),
          })),
        });
        return;
      }

      const keyMatch = url.pathname.match(/^\/v1\/keys\/([^/]+)$/);
      if (method === 'PUT' && keyMatch) {
        if (!requireAuth(req, res)) return;
        const provider = decodeURIComponent(keyMatch[1]!);
        const body = JSON.parse(await readBody(req)) as { api_key: string };
        const store = loadKeys();
        store.keys[provider] = { apiKey: body.api_key, setAt: new Date().toISOString() };
        saveKeys(store);
        sendJson(res, 200, { ok: true, provider });
        return;
      }

      const proxyMatch = url.pathname.match(/^\/v1\/proxy\/([^/]+)\/chat\/completions$/);
      if (method === 'POST' && proxyMatch) {
        if (!requireAuth(req, res)) return;
        const provider = decodeURIComponent(proxyMatch[1]!);
        const body = JSON.parse(await readBody(req)) as {
          model: string;
          messages: { role: string; content: string }[];
          max_tokens?: number;
        };
        const store = loadKeys();
        const key = store.keys[provider]?.apiKey;
        if (!key || key.startsWith('sk-mock')) {
          sendJson(res, 200, {
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
            proxy: 'mock',
          });
          return;
        }
        const baseUrl = DEFAULT_BASE_URLS[provider] ?? DEFAULT_BASE_URLS.openai!;
        const upstream = await request(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: body.model,
            messages: body.messages,
            max_tokens: body.max_tokens ?? 64,
          }),
        });
        const text = await upstream.body.text();
        res.writeHead(upstream.statusCode, { 'Content-Type': 'application/json' });
        res.end(text);
        return;
      }

      if (method === 'POST' && url.pathname === '/v1/sync/push') {
        if (!requireAuth(req, res)) return;
        const body = JSON.parse(await readBody(req)) as {
          project_id: string;
          files: Record<string, string>;
        };
        const dir = syncDir(body.project_id);
        for (const [rel, content] of Object.entries(body.files)) {
          const target = join(dir, rel);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, content, 'utf8');
        }
        const revision = new Date().toISOString();
        writeFileSync(join(dir, '_revision.json'), JSON.stringify({ revision }), 'utf8');
        sendJson(res, 200, { revision, count: Object.keys(body.files).length });
        return;
      }

      if (method === 'GET' && url.pathname === '/v1/sync/pull') {
        if (!requireAuth(req, res)) return;
        const projectId = url.searchParams.get('project_id') ?? 'default';
        const dir = syncDir(projectId);
        const files: Record<string, string> = {};
        function walk(base: string, rel = ''): void {
          if (!existsSync(base)) return;
          for (const name of readdirSync(base)) {
            if (name.startsWith('_')) continue;
            const full = join(base, name);
            const relPath = rel ? `${rel}/${name}` : name;
            if (statSync(full).isDirectory()) walk(full, relPath);
            else files[relPath.replace(/\\/g, '/')] = readFileSync(full, 'utf8');
          }
        }
        walk(dir);
        const revPath = join(dir, '_revision.json');
        const revision = existsSync(revPath)
          ? (JSON.parse(readFileSync(revPath, 'utf8')) as { revision: string }).revision
          : '';
        sendJson(res, 200, { revision, files });
        return;
      }

      if (method === 'POST' && url.pathname === '/v1/audit/replay') {
        if (!requireAuth(req, res)) return;
        const body = JSON.parse(await readBody(req)) as {
          project_id: string;
          event: Record<string, unknown>;
        };
        const auditPath = dataPath('audit', body.project_id, 'replay.jsonl');
        mkdirSync(join(auditPath, '..'), { recursive: true });
        writeFileSync(auditPath, `${JSON.stringify(body.event)}\n`, { flag: 'a' });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true, service: 'spark-cli-cloud-mock' });
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const bound = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: bound,
        close: () => server.close(),
      });
    });
  });
}
