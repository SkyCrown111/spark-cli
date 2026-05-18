/**
 * Phase 14 #3 — Godot `.tscn` writer (staging-safe).
 *
 * Godot scene files are line-oriented INI-with-typed-values:
 *   [gd_scene load_steps=2 format=3 uid="uid://..."]
 *   [ext_resource type="Script" path="res://scripts/sample.gd" id="1_sample"]
 *   [sub_resource type="..." id="..."]
 *
 *   [node name="Main" type="Node2D"]
 *   script = ExtResource("1_sample")
 *
 *   [node name="Player" type="Node2D" parent="."]
 *
 *   [connection signal="pressed" from="Player/Btn" to="Main" method="_on_btn"]
 *
 * We do not run a real GDScript value parser. We just slice into "doc blocks"
 * keyed by their header line, scan-and-replace single-line `key = value` pairs
 * inside each block, and append new blocks at the end of the file when adding
 * nodes / connections. This is enough for the agent to make targeted edits
 * without risking whole-file rewrites.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageWriteFile } from '../../core/staging/patch-manager.js';

interface ParsedTscn {
  /** Original raw text (with line endings preserved). */
  raw: string;
  /** Line-split view used for in-place rewrites. */
  lines: string[];
  /** EOL used by the file ('\r\n' or '\n'). */
  eol: string;
}

function loadTscn(full: string): ParsedTscn {
  const raw = readFileSync(full, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { raw, lines: raw.split(/\r?\n/), eol };
}

function saveTscn(parsed: ParsedTscn): string {
  return parsed.lines.join(parsed.eol);
}

/**
 * Find the [start,end) line range of the [node ...] block matching `nodePath`.
 * `nodePath` follows Godot conventions: "." for the root, or "Player/Btn" for
 * descendants. We resolve by walking declared parents bottom-up.
 *
 * Throws if the node cannot be located.
 */
function findNodeBlock(parsed: ParsedTscn, nodePath: string): { start: number; end: number } {
  const lines = parsed.lines;
  type NodeHeader = { name: string; parent?: string; lineIndex: number };
  const headers: NodeHeader[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.startsWith('[node ')) continue;
    const nameMatch = /name="([^"]+)"/.exec(line);
    const parentMatch = /parent="([^"]+)"/.exec(line);
    if (!nameMatch) continue;
    headers.push({ name: nameMatch[1]!, parent: parentMatch?.[1], lineIndex: i });
  }
  if (headers.length === 0) throw new Error(`No nodes found in scene`);

  // Build a name→header map per parent path for resolution.
  // The root header has no `parent` attribute.
  let target: NodeHeader | undefined;
  if (nodePath === '.' || nodePath === '') {
    target = headers.find((h) => h.parent === undefined);
  } else {
    const parts = nodePath.split('/').filter(Boolean);
    // Each step's parent path (Godot uses "." for root, then "Name", then "Name/Child").
    let parentPath = '.';
    let current: NodeHeader | undefined = headers.find(
      (h) => h.name === parts[0] && h.parent === parentPath,
    );
    for (let p = 1; current && p < parts.length; p++) {
      parentPath = p === 1 ? parts[0]! : `${parts.slice(0, p).join('/')}`;
      current = headers.find((h) => h.name === parts[p] && h.parent === parentPath);
    }
    target = current;
  }
  if (!target) throw new Error(`Node not found: ${nodePath}`);

  const start = target.lineIndex;
  // End is the next [section] header or EOF.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (l.startsWith('[') && l.endsWith(']')) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// ---------- public API -----------------------------------------------------

export interface SetNodePropertyResult {
  scenePath: string;
  nodePath: string;
  property: string;
  staged: true;
  inserted: boolean;
}

/**
 * Set `key = rawValue` inside the [node …] block for `nodePath`.
 *
 * `rawValue` is written verbatim — callers compose it (e.g. `'"hello"'`,
 * `'Vector2(1, 2)'`, `'ExtResource("1_sample")'`). We don't quote/escape on
 * the caller's behalf because Godot's value space is too varied.
 */
export function setGodotSceneProperty(
  projectRoot: string,
  sceneRel: string,
  nodePath: string,
  key: string,
  rawValue: string,
): SetNodePropertyResult {
  const full = join(projectRoot, sceneRel);
  const parsed = loadTscn(full);
  const { start, end } = findNodeBlock(parsed, nodePath);

  const propRe = new RegExp(`^${escapeForRegex(key)}\\s*=`);
  let inserted = true;
  for (let i = start + 1; i < end; i++) {
    const line = parsed.lines[i] ?? '';
    if (propRe.test(line)) {
      parsed.lines[i] = `${key} = ${rawValue}`;
      inserted = false;
      break;
    }
  }
  if (inserted) {
    // Insert just after the header — keeps property block adjacent to its node.
    parsed.lines.splice(start + 1, 0, `${key} = ${rawValue}`);
  }
  stageWriteFile(projectRoot, sceneRel, saveTscn(parsed));
  return { scenePath: sceneRel, nodePath, property: key, staged: true, inserted };
}

export interface AddNodeResult {
  scenePath: string;
  nodePath: string;
  parentPath: string;
  type: string;
  staged: true;
}

export function addGodotSceneNode(
  projectRoot: string,
  sceneRel: string,
  parentPath: string,
  type: string,
  name: string,
): AddNodeResult {
  const full = join(projectRoot, sceneRel);
  const parsed = loadTscn(full);

  // Validate parent exists (root may be ".").
  if (parentPath !== '.' && parentPath !== '') findNodeBlock(parsed, parentPath);

  const headerSafeName = name.replace(/"/g, '');
  const headerSafeParent = parentPath || '.';
  const headerSafeType = type;
  // Reject a duplicate sibling with the same name under that parent.
  for (let i = 0; i < parsed.lines.length; i++) {
    const line = parsed.lines[i] ?? '';
    if (
      line.startsWith('[node ') &&
      line.includes(`name="${headerSafeName}"`) &&
      line.includes(`parent="${headerSafeParent}"`)
    ) {
      throw new Error(`Node ${headerSafeParent}/${headerSafeName} already exists`);
    }
  }

  const header = `[node name="${headerSafeName}" type="${headerSafeType}" parent="${headerSafeParent}"]`;
  // Append at end of file. Godot tolerates an extra trailing blank line.
  // Make sure we have a leading blank line before the new header.
  if (parsed.lines.length > 0 && (parsed.lines[parsed.lines.length - 1] ?? '') !== '') {
    parsed.lines.push('');
  }
  parsed.lines.push(header);

  stageWriteFile(projectRoot, sceneRel, saveTscn(parsed));
  const nodePath = parentPath === '.' || parentPath === '' ? name : `${parentPath}/${name}`;
  return { scenePath: sceneRel, nodePath, parentPath: headerSafeParent, type, staged: true };
}

export interface ConnectSignalResult {
  scenePath: string;
  signal: string;
  from: string;
  to: string;
  method: string;
  staged: true;
}

export function connectGodotSceneSignal(
  projectRoot: string,
  sceneRel: string,
  args: { signal: string; from: string; to: string; method: string },
): ConnectSignalResult {
  const full = join(projectRoot, sceneRel);
  const parsed = loadTscn(full);
  const header = `[connection signal="${args.signal}" from="${args.from}" to="${args.to}" method="${args.method}"]`;
  // Reject exact duplicate.
  if (parsed.lines.some((l) => l === header)) {
    throw new Error(`Connection already exists: ${args.signal} ${args.from} -> ${args.to}`);
  }
  if (parsed.lines.length > 0 && (parsed.lines[parsed.lines.length - 1] ?? '') !== '') {
    parsed.lines.push('');
  }
  parsed.lines.push(header);
  stageWriteFile(projectRoot, sceneRel, saveTscn(parsed));
  return { scenePath: sceneRel, ...args, staged: true };
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
