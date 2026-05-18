import { describe, it, expect, afterEach } from 'vitest';
import { startCloudMockServer } from './mock-server.js';

describe('cloud mock server', () => {
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
  });

  it('health and device login flow', async () => {
    const srv = await startCloudMockServer(0);
    close = srv.close;
    const base = `http://127.0.0.1:${srv.port}`;

    const health = await fetch(`${base}/health`);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);

    const device = await fetch(`${base}/v1/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_approve: true }),
    });
    const d = (await device.json()) as { deviceCode: string };
    const token = await fetch(`${base}/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: d.deviceCode }),
    });
    const session = (await token.json()) as { accessToken: string };
    expect(session.accessToken).toMatch(/^gcli_/);

    const proxy = await fetch(`${base}/v1/proxy/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    expect(proxy.status).toBe(200);
    const body = (await proxy.json()) as { choices: unknown[] };
    expect(body.choices?.length).toBeGreaterThan(0);
  });
});
