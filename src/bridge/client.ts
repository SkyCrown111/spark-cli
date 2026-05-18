import { WebSocket } from 'undici';
import type { BridgeRequest, BridgeResponse } from './protocol.js';
import { DEFAULT_BRIDGE_PORT } from './protocol.js';

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'refused' | 'error' = 'error',
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

export async function bridgeRequest(
  method: string,
  params: Record<string, unknown> = {},
  options: { port?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  const port = options.port ?? DEFAULT_BRIDGE_PORT;
  const timeoutMs = options.timeoutMs ?? 5000;
  const id = crypto.randomUUID();
  const payload: BridgeRequest = { id, method, params };

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(
        new BridgeError(
          `Bridge timeout (${timeoutMs}ms). Is Cocos running with spark-cli-bridge extension?`,
          'timeout',
        ),
      );
    }, timeoutMs);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.addEventListener('message', (event) => {
      clearTimeout(timer);
      try {
        const data =
          typeof event.data === 'string'
            ? event.data
            : Buffer.from(event.data as ArrayBuffer).toString('utf8');
        const res = JSON.parse(data) as BridgeResponse;
        if (res.id && res.id !== id) return;
        ws.close();
        if (res.ok) resolve(res.result);
        else reject(new BridgeError(res.error ?? 'Bridge request failed', 'error'));
      } catch (e) {
        ws.close();
        reject(e);
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(
        new BridgeError(
          `Cannot connect to Editor Bridge at ws://127.0.0.1:${port}. Enable extensions/spark-cli-bridge in Cocos.`,
          'refused',
        ),
      );
    });
  });
}
