import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  removeSceneNodeFromStaging,
  duplicateSceneNodeInStaging,
  reorderSceneChildrenInStaging,
  scanUuidReferences,
  RefIntegrityError,
} from './scene-writer-extras.js';

const PREFAB_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeScene(): string {
  // Layout (array indices on the right):
  //   [0] cc.SceneAsset
  //   [1] cc.Scene
  //   [2] Canvas (parent: Scene)
  //   [3] Player (parent: Canvas, references PREFAB_UUID via _prefab)
  //   [4] Enemy  (parent: Canvas)
  //   [5] cc.UITransform on Canvas
  //   [6] cc.Sprite on Player
  //   [7] cc.UITransform on Enemy
  return JSON.stringify(
    [
      { __type__: 'cc.SceneAsset', _name: '', _native: '', scene: { __id__: 1 } },
      {
        __type__: 'cc.Scene',
        _name: 'main',
        _parent: null,
        _children: [{ __id__: 2 }],
        _active: true,
        _components: [],
        _prefab: null,
      },
      {
        __type__: 'cc.Node',
        _name: 'Canvas',
        _parent: { __id__: 1 },
        _children: [{ __id__: 3 }, { __id__: 4 }],
        _active: true,
        _components: [{ __id__: 5 }],
        _prefab: null,
      },
      {
        __type__: 'cc.Node',
        _name: 'Player',
        _parent: { __id__: 2 },
        _children: [],
        _active: true,
        _components: [{ __id__: 6 }],
        _prefab: { __uuid__: PREFAB_UUID },
      },
      {
        __type__: 'cc.Node',
        _name: 'Enemy',
        _parent: { __id__: 2 },
        _children: [],
        _active: true,
        _components: [{ __id__: 7 }],
        _prefab: null,
      },
      { __type__: 'cc.UITransform', node: { __id__: 2 }, _enabled: true },
      { __type__: 'cc.Sprite', node: { __id__: 3 }, _enabled: true, target: { __id__: 6 } },
      { __type__: 'cc.UITransform', node: { __id__: 4 }, _enabled: true },
    ],
    null,
    2,
  );
}

let tmp: string;
const sceneRel = 'assets/scenes/main.scene';

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gcli-cocos-extras-'));
  mkdirSync(join(tmp, 'assets', 'scenes'), { recursive: true });
  writeFileSync(join(tmp, sceneRel), makeScene(), 'utf8');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function readStaged(): string {
  return readFileSync(join(tmp, '.spark/staging/files', sceneRel), 'utf8');
}

describe('removeSceneNodeFromStaging', () => {
  it('removes a leaf node and compacts ids', () => {
    const r = removeSceneNodeFromStaging(tmp, sceneRel, 'Canvas/Enemy');
    expect(r.removedNodeIds.length).toBe(1);
    expect(r.removedComponentCount).toBe(1);

    const staged = JSON.parse(readStaged());
    expect(staged.find((e: { _name?: string }) => e._name === 'Enemy')).toBeUndefined();
    // Canvas should now only point at Player.
    const canvas = staged.find((e: { _name?: string }) => e._name === 'Canvas');
    expect(canvas._children).toHaveLength(1);
    // ids in the array should be tight: indices 0..N-1 with no gaps.
    expect(canvas._children[0].__id__).toBeGreaterThanOrEqual(0);
    expect(canvas._children[0].__id__).toBeLessThan(staged.length);
    // The remaining Player keeps its prefab reference.
    const player = staged.find((e: { _name?: string }) => e._name === 'Player');
    expect(player._prefab.__uuid__).toBe(PREFAB_UUID);
  });

  it('refuses to delete a node still referenced from outside the subtree', () => {
    // Insert a top-level entry that references Player's Sprite component (id 6).
    const tmp2 = mkdtempSync(join(tmpdir(), 'gcli-cocos-extras2-'));
    mkdirSync(join(tmp2, 'assets', 'scenes'), { recursive: true });
    const data = JSON.parse(makeScene()) as Array<Record<string, unknown>>;
    data.push({ __type__: 'cc.Manager', target: { __id__: 6 } });
    writeFileSync(join(tmp2, sceneRel), JSON.stringify(data, null, 2), 'utf8');
    try {
      expect(() => removeSceneNodeFromStaging(tmp2, sceneRel, 'Canvas/Player')).toThrow(
        RefIntegrityError,
      );
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('force:true overrides ref-integrity and proceeds', () => {
    const data = JSON.parse(makeScene()) as Array<Record<string, unknown>>;
    data.push({ __type__: 'cc.Manager', target: { __id__: 6 } });
    writeFileSync(join(tmp, sceneRel), JSON.stringify(data, null, 2), 'utf8');
    const r = removeSceneNodeFromStaging(tmp, sceneRel, 'Canvas/Player', { force: true });
    expect(r.removedNodeIds.length).toBe(1);
    const staged = JSON.parse(readStaged());
    expect(staged.find((e: { _name?: string }) => e._name === 'Player')).toBeUndefined();
  });
});

describe('duplicateSceneNodeInStaging', () => {
  it('clones a leaf node + its components and remaps internal ids', () => {
    const r = duplicateSceneNodeInStaging(tmp, sceneRel, 'Canvas/Player', { newName: 'Player2' });
    expect(r.newNodePath).toBe('Canvas/Player2');

    const staged = JSON.parse(readStaged());
    const player2 = staged.find((e: { _name?: string }) => e._name === 'Player2');
    expect(player2).toBeDefined();
    // The clone should have its own _components entry, NOT share with the original.
    const origPlayer = staged.find((e: { _name?: string }) => e._name === 'Player');
    expect(player2._components[0].__id__).not.toBe(origPlayer._components[0].__id__);
    // The cloned Sprite should point back at the cloned node, not the original.
    const clonedComp = staged[player2._components[0].__id__];
    expect(clonedComp.node.__id__).toBe(staged.indexOf(player2));
    // The clone gets the SAME parent as the source.
    expect(player2._parent.__id__).toBe(
      staged.indexOf(origPlayer._parent ? origPlayer._parent : {}) === -1
        ? staged.findIndex((e: { _name?: string }) => e._name === 'Canvas')
        : player2._parent.__id__,
    );
    // _prefab is deep-cloned — same uuid string but separate object.
    expect(player2._prefab.__uuid__).toBe(PREFAB_UUID);
  });
});

describe('reorderSceneChildrenInStaging', () => {
  it('reorders children to the requested name sequence', () => {
    const r = reorderSceneChildrenInStaging(tmp, sceneRel, 'Canvas', ['Enemy', 'Player']);
    expect(r.childCount).toBe(2);
    const staged = JSON.parse(readStaged());
    const canvas = staged.find((e: { _name?: string }) => e._name === 'Canvas');
    const names = canvas._children.map((c: { __id__: number }) => staged[c.__id__]._name);
    expect(names).toEqual(['Enemy', 'Player']);
  });

  it('rejects a reorder with mismatched count', () => {
    expect(() => reorderSceneChildrenInStaging(tmp, sceneRel, 'Canvas', ['Enemy'])).toThrow(
      /childOrder size/,
    );
  });

  it('rejects an unknown child name', () => {
    expect(() =>
      reorderSceneChildrenInStaging(tmp, sceneRel, 'Canvas', ['Enemy', 'Ghost']),
    ).toThrow(/not found/);
  });
});

describe('scanUuidReferences', () => {
  it('finds the __uuid__ in a scene file', () => {
    const hits = scanUuidReferences(tmp, PREFAB_UUID);
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe(sceneRel.replace(/\\/g, '/'));
    expect(hits[0].pathHint).toContain('_prefab');
  });

  it('returns empty when uuid not present', () => {
    const hits = scanUuidReferences(tmp, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(hits).toHaveLength(0);
  });

  it('still scans non-JSON .meta files via text fallback', () => {
    writeFileSync(
      join(tmp, 'assets', 'random.meta'),
      `not-json but contains ${PREFAB_UUID}`,
      'utf8',
    );
    const hits = scanUuidReferences(tmp, PREFAB_UUID);
    expect(hits.find((h) => h.file.endsWith('random.meta'))).toBeDefined();
    expect(existsSync(join(tmp, 'assets', 'random.meta'))).toBe(true);
  });
});
