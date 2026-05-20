import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readStagingSnapshot, writeStagedFile } from './staging-sync.js';
import { validateLevelData } from '../level/types.js';
import { validateAnimGraph } from '../anim/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getEditorStaticDir(): string {
  const bundled = join(__dirname, 'editor', 'public');
  if (existsSync(join(bundled, 'index.html'))) return bundled;
  const dev = join(__dirname, '..', '..', '..', 'editor', 'public');
  return dev;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function isTrustedEditorOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  if (!host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function serveStatic(res: ServerResponse, urlPath: string): boolean {
  const root = getEditorStaticDir();
  const safe = normalize(urlPath.replace(/^\//, '')) || 'index.html';
  if (safe.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  const file = join(root, safe === '/' ? 'index.html' : safe);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    return false;
  }
  const ext = extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
  return true;
}

export interface EditorServerOptions {
  projectRoot: string;
  port: number;
  host?: string;
}

export function startEditorServer(opts: EditorServerOptions): Promise<{ port: number; close: () => void }> {
  const host = opts.host ?? '127.0.0.1';

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`);
    const method = req.method ?? 'GET';
    const trustedOrigin = isTrustedEditorOrigin(req);

    if (req.headers.origin && trustedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (method === 'OPTIONS') {
      if (!trustedOrigin) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, project: opts.projectRoot });
      return;
    }

    if (url.pathname === '/api/staging' && method === 'GET') {
      sendJson(res, 200, readStagingSnapshot(opts.projectRoot));
      return;
    }

    if (url.pathname === '/api/staging/file' && method === 'POST') {
      if (!trustedOrigin) {
        sendJson(res, 403, { error: 'cross-origin requests are not allowed' });
        return;
      }
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { path: string; content: string };
        if (!body.path || typeof body.content !== 'string') {
          sendJson(res, 400, { error: 'path and content required' });
          return;
        }
        writeStagedFile(opts.projectRoot, body.path, body.content);
        sendJson(res, 200, { ok: true, path: body.path });
      } catch (e) {
        sendJson(res, 400, { error: String(e) });
      }
      return;
    }

    const levelMatch = url.pathname.match(/^\/api\/level\/(.+)$/);
    if (levelMatch && method === 'GET') {
      const rel = decodeURIComponent(levelMatch[1]!);
      const snap = readStagingSnapshot(opts.projectRoot);
      const content = snap.files[rel];
      if (!content) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      try {
        const data = JSON.parse(content);
        sendJson(res, 200, { path: rel, data, valid: validateLevelData(data) });
      } catch {
        sendJson(res, 200, { path: rel, raw: content });
      }
      return;
    }

    const animMatch = url.pathname.match(/^\/api\/anim\/(.+)$/);
    if (animMatch && method === 'GET') {
      const rel = decodeURIComponent(animMatch[1]!);
      const snap = readStagingSnapshot(opts.projectRoot);
      const content = snap.files[rel];
      if (!content) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      try {
        const data = JSON.parse(content);
        sendJson(res, 200, { path: rel, data, valid: validateAnimGraph(data) });
      } catch {
        sendJson(res, 200, { path: rel, raw: content });
      }
      return;
    }

    if (method === 'GET' && serveStatic(res, url.pathname)) return;

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port, host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      resolve({
        port,
        close: () => server.close(),
      });
    });
  });
}
