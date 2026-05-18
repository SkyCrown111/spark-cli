import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { bridgeRequest } from './client.js';

describe('bridge client', () => {
  it('sends scene.open and receives result', async () => {
    const port = 17399;
    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        socket.send(
          JSON.stringify({
            id: msg.id,
            ok: true,
            result: { opened: msg.params?.path, mock: true },
          }),
        );
      });
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(port, '127.0.0.1', () => resolve());
      httpServer.on('error', reject);
    });

    try {
      const result = (await bridgeRequest(
        'scene.open',
        { path: 'assets/scenes/main.scene' },
        { port, timeoutMs: 3000 },
      )) as { opened?: string };
      expect(result.opened).toBe('assets/scenes/main.scene');
    } finally {
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => httpServer.close(() => r()));
    }
  });
});
