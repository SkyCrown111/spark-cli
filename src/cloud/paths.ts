import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_CLOUD_ENDPOINT = 'http://127.0.0.1:17400';

export function getCloudSessionPath(): string {
  return join(homedir(), '.spark', 'cloud', 'session.json');
}

export function getCloudDataDir(): string {
  return join(homedir(), '.spark', 'cloud-data');
}
