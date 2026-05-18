import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  parseUnityScene,
} from './scene-graph.js';
import {
  parseNestedPath,
  setNestedProperty,
  removeComponent,
  replacePrefabInstance,
} from './scene-writer-nested.js';
import {
  setUnitySceneNestedProperty,
  removeUnitySceneComponent,
  replaceUnityScenePrefabInstance,
} from './scene-writer.js';
import { clearStaging, hasStaging } from '../../core/staging/patch-manager.js';

const fixture = join(process.cwd(), 'fixtures/unity-mini');
const sceneRel = 'Assets/Scenes/Battle.unity';

describe('parseNestedPath', () => {
  it('parses dotted keys and bracket indices', () => {
    expect(parseNestedPath('m_LocalScale.x')).toEqual([
      { kind: 'key', name: 'm_LocalScale' },
      { kind: 'key', name: 'x' },
    ]);
    expect(parseNestedPath('m_Component[2].component.fileID')).toEqual([
      { kind: 'key', name: 'm_Component' },
      { kind: 'index', idx: 2 },
      { kind: 'key', name: 'component' },
      { kind: 'key', name: 'fileID' },
    ]);
  });

  it('rejects invalid paths', () => {
    expect(() => parseNestedPath('foo[abc]')).toThrow(/invalid index/);
    expect(() => parseNestedPath('foo[1')).toThrow(/missing/);
    expect(() => parseNestedPath('.foo')).toThrow(/empty key/);
  });
});

describe('setNestedProperty', () => {
  it('rewrites an inline flow-map field (m_LocalScale.x)', () => {
    const scene = parseUnityScene(join(fixture, sceneRel));
    const r = setNestedProperty(scene, '100101', 'm_LocalScale.x', '1.5');
    expect(r.changed).toBe(true);
    // The Hero Transform (fileId 100101) should now have x: 1.5.
    const heroTrLine = r.text
      .split('\n')
      .find((l) => l.includes('m_LocalScale:') && l.includes('x: 1.5'));
    expect(heroTrLine).toBeDefined();
    // The Enemy Transform (fileId 200201) is untouched.
    expect(r.text).toContain('m_LocalScale: {x: 1, y: 1, z: 1}');
  });

  it('throws when path leaf is missing', () => {
    const scene = parseUnityScene(join(fixture, sceneRel));
    expect(() => setNestedProperty(scene, '100101', 'm_LocalScale.w', '0')).toThrow();
  });

  it('throws on unknown fileId', () => {
    const scene = parseUnityScene(join(fixture, sceneRel));
    expect(() => setNestedProperty(scene, '999999', 'm_Name', 'X')).toThrow(/no doc/);
  });
});

describe('removeComponent', () => {
  it('drops the component reference and its document', () => {
    const scene = parseUnityScene(join(fixture, sceneRel));
    const r = removeComponent(scene, '100100', '100102');
    expect(r.removedComponentFileId).toBe('100102');
    // No more `--- !u!114 &100102` header anywhere.
    expect(r.text).not.toMatch(/&100102\b/);
    // No more m_Component entry pointing at 100102 on the Hero GameObject.
    const lines = r.text.split('\n');
    const heroIdx = lines.findIndex((l) => l.includes('m_Name: Hero'));
    expect(heroIdx).toBeGreaterThan(0);
    // walk backwards to the GameObject doc start, then forward to find m_Component block
    const heroComponents = r.text
      .split('--- !u!')
      .find((doc) => doc.startsWith('1 &100100'));
    expect(heroComponents).toBeDefined();
    expect(heroComponents).not.toMatch(/fileID: 100102/);
    // Hero still has its Transform.
    expect(heroComponents).toMatch(/fileID: 100101/);
  });

  it('throws when GameObject does not reference the component', () => {
    const scene = parseUnityScene(join(fixture, sceneRel));
    // 200201 belongs to the Enemy GameObject, not the Hero.
    expect(() => removeComponent(scene, '100100', '200201')).toThrow(/does not reference/);
  });
});

describe('replacePrefabInstance', () => {
  it('rewrites m_SourcePrefab guid AND modification target guids', () => {
    const scene = parseUnityScene(join(fixture, sceneRel));
    const newGuid = 'd'.repeat(32);
    const r = replacePrefabInstance(scene, {
      instanceFileId: '300300',
      newPrefabGuid: newGuid,
    });
    expect(r.changed).toBe(true);
    expect(r.oldGuid).toBe('c'.repeat(32));
    expect(r.text).toContain(`m_SourcePrefab: {fileID: 100100, guid: ${newGuid}, type: 3}`);
    // Modifications targets that pointed at the old guid now point at the new one.
    const modCount = (r.text.match(new RegExp(`guid: ${newGuid}`, 'g')) ?? []).length;
    // 1 (source) + 2 (modification targets sharing the guid) = 3
    expect(modCount).toBe(3);
    // Old guid no longer appears.
    expect(r.text).not.toContain('c'.repeat(32));
  });

  it('throws when the doc is not a PrefabInstance', () => {
    const scene = parseUnityScene(join(fixture, sceneRel));
    expect(() =>
      replacePrefabInstance(scene, { instanceFileId: '100100', newPrefabGuid: '0'.repeat(32) }),
    ).toThrow(/not PrefabInstance/);
  });
});

describe('scene-writer staging integration', () => {
  it('stages nested-property write under .spark-cli/staging/', () => {
    if (hasStaging(fixture)) clearStaging(fixture);
    const r = setUnitySceneNestedProperty(fixture, sceneRel, '100101', 'm_LocalScale.x', '2');
    expect(r.changed).toBe(true);
    expect(hasStaging(fixture)).toBe(true);
    const staged = readFileSync(join(fixture, '.spark-cli/staging/files', sceneRel), 'utf8');
    expect(staged).toContain('m_LocalScale: {x: 2, y: 1, z: 1}');
    clearStaging(fixture);
  });

  it('stages component removal', () => {
    if (hasStaging(fixture)) clearStaging(fixture);
    const r = removeUnitySceneComponent(fixture, sceneRel, '100100', '100102');
    expect(r.removedComponentFileId).toBe('100102');
    const staged = readFileSync(join(fixture, '.spark-cli/staging/files', sceneRel), 'utf8');
    expect(staged).not.toMatch(/&100102\b/);
    clearStaging(fixture);
  });

  it('stages prefab-instance replacement', () => {
    if (hasStaging(fixture)) clearStaging(fixture);
    const newGuid = 'e'.repeat(32);
    const r = replaceUnityScenePrefabInstance(fixture, sceneRel, {
      instanceFileId: '300300',
      newPrefabGuid: newGuid,
    });
    expect(r.changed).toBe(true);
    const staged = readFileSync(join(fixture, '.spark-cli/staging/files', sceneRel), 'utf8');
    expect(staged).toContain(`guid: ${newGuid}`);
    clearStaging(fixture);
  });
});
