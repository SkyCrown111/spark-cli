import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { installPlugin, listPlugins, uninstallPlugin } from './manager.js';

const project = join(process.cwd(), 'fixtures/cocos-3.8-mini');
const source = join(process.cwd(), 'plugins/hello-spark-cli');

describe('plugin manager', () => {
  it('installs and lists sample plugin', () => {
    const installed = installPlugin(project, source);
    expect(installed.name).toBe('hello-spark-cli');
    expect(existsSync(join(installed.path, '.spark-installed.json'))).toBe(true);
    const list = listPlugins(project);
    expect(list.some((p) => p.name === 'hello-spark-cli')).toBe(true);
    uninstallPlugin(project, 'hello-spark-cli');
    expect(listPlugins(project).some((p) => p.name === 'hello-spark-cli')).toBe(false);
  });
});
