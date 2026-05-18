import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  addSceneNodeToStaging,
  updateSceneComponentInStaging,
} from './scene-writer.js';
import { applyStaging, clearStaging, hasStaging } from '../../core/staging/patch-manager.js';

const fixture = join(process.cwd(), 'fixtures/cocos-3.8-mini');
const sceneRel = 'assets/scenes/main.scene';

describe('scene-writer', () => {
  it('stages a new child node', () => {
    if (hasStaging(fixture)) clearStaging(fixture);
    const result = addSceneNodeToStaging(fixture, sceneRel, 'Canvas', 'HUD');
    expect(result.nodePath).toBe('Canvas/HUD');
    expect(hasStaging(fixture)).toBe(true);

    const staged = readFileSync(
      join(fixture, '.spark-cli/staging/files', sceneRel),
      'utf8',
    );
    expect(staged).toContain('"HUD"');

    clearStaging(fixture);
  });

  it('stages component property update', () => {
    if (hasStaging(fixture)) clearStaging(fixture);
    updateSceneComponentInStaging(fixture, sceneRel, 'Canvas', 'cc.UITransform', {
      _enabled: false,
    });
    applyStaging(fixture, { yes: true, backup: false });
    const raw = readFileSync(join(fixture, sceneRel), 'utf8');
    expect(raw).toContain('"_enabled": false');
    // restore enabled for other tests
    updateSceneComponentInStaging(fixture, sceneRel, 'Canvas', 'cc.UITransform', {
      _enabled: true,
    });
    applyStaging(fixture, { yes: true, backup: false });
  });
});
