import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setGodotSceneProperty,
  addGodotSceneNode,
  connectGodotSceneSignal,
} from './scene-writer.js';

const SCENE = `[gd_scene load_steps=2 format=3 uid="uid://spark-cli_main"]

[ext_resource type="Script" path="res://scripts/sample.gd" id="1_sample"]

[node name="Main" type="Node2D"]
script = ExtResource("1_sample")

[node name="Player" type="Node2D" parent="."]
`;

let tmp: string;
const sceneRel = 'scenes/main.tscn';

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gcli-godot-writer-'));
  mkdirSync(join(tmp, 'scenes'), { recursive: true });
  writeFileSync(join(tmp, sceneRel), SCENE, 'utf8');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function readStaged(): string {
  return readFileSync(join(tmp, '.spark/staging/files', sceneRel), 'utf8');
}

describe('setGodotSceneProperty', () => {
  it('rewrites an existing key inside the matched node block', () => {
    const r = setGodotSceneProperty(tmp, sceneRel, '.', 'script', 'ExtResource("2_other")');
    expect(r.staged).toBe(true);
    expect(r.inserted).toBe(false);
    const out = readStaged();
    expect(out).toContain('script = ExtResource("2_other")');
    // The Player block must remain untouched.
    expect(out).toContain('[node name="Player" type="Node2D" parent="."]');
  });

  it('inserts a new key when one does not exist', () => {
    const r = setGodotSceneProperty(tmp, sceneRel, 'Player', 'position', 'Vector2(10, 20)');
    expect(r.inserted).toBe(true);
    const out = readStaged();
    // The new line must be associated with the Player block.
    const playerIdx = out.indexOf('[node name="Player"');
    expect(playerIdx).toBeGreaterThan(-1);
    const tail = out.slice(playerIdx);
    expect(tail).toMatch(/^\[node name="Player"[^\n]*\nposition = Vector2\(10, 20\)/);
  });

  it('throws when the node path is not present', () => {
    expect(() => setGodotSceneProperty(tmp, sceneRel, 'Ghost', 'foo', '1')).toThrow(
      /Node not found/,
    );
  });
});

describe('addGodotSceneNode', () => {
  it('appends a new [node] header under the named parent', () => {
    const r = addGodotSceneNode(tmp, sceneRel, 'Player', 'Sprite2D', 'Icon');
    expect(r.nodePath).toBe('Player/Icon');
    expect(readStaged()).toContain('[node name="Icon" type="Sprite2D" parent="Player"]');
  });

  it('rejects duplicate sibling names', () => {
    addGodotSceneNode(tmp, sceneRel, '.', 'Node2D', 'Twin');
    // commit by re-reading the staged file as the new starting point would defeat the test;
    // call the second add directly — same project root, second call sees only the original
    // file (writer reads from project root, not staging). So write the staged result back
    // to the project file to simulate "applied".
    const staged = readStaged();
    writeFileSync(join(tmp, sceneRel), staged, 'utf8');
    expect(() => addGodotSceneNode(tmp, sceneRel, '.', 'Node2D', 'Twin')).toThrow(/already exists/);
  });
});

describe('connectGodotSceneSignal', () => {
  it('appends a [connection] section', () => {
    const r = connectGodotSceneSignal(tmp, sceneRel, {
      signal: 'pressed',
      from: 'Player',
      to: '.',
      method: '_on_player_pressed',
    });
    expect(r.staged).toBe(true);
    expect(readStaged()).toContain(
      '[connection signal="pressed" from="Player" to="." method="_on_player_pressed"]',
    );
  });

  it('rejects an exact duplicate connection', () => {
    connectGodotSceneSignal(tmp, sceneRel, {
      signal: 'pressed',
      from: 'Player',
      to: '.',
      method: '_on_player_pressed',
    });
    const staged = readStaged();
    writeFileSync(join(tmp, sceneRel), staged, 'utf8');
    expect(() =>
      connectGodotSceneSignal(tmp, sceneRel, {
        signal: 'pressed',
        from: 'Player',
        to: '.',
        method: '_on_player_pressed',
      }),
    ).toThrow(/already exists/);
  });
});
