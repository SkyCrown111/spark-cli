export interface BridgeRequest {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface BridgeResponse {
  id?: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export const DEFAULT_BRIDGE_PORT = 17321;
