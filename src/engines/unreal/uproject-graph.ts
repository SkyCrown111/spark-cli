/**
 * Phase 14 #4 — Unreal `.uproject` module graph.
 *
 * Walks `<root>/<uproject>` + `<root>/Source/**\/*.{Build,Target}.cs` and
 * builds:
 *   { modules: [{ name, type, deps[] }] }
 *
 * The Build.cs / Target.cs files are real C# under the hood, but we don't run
 * a C# parser. Instead we lift the `Public/PrivateDependencyModuleNames`
 * `.AddRange(new string[] { "A", "B" })` calls and the `Type =` / `: base()`
 * hints. This is enough for an agent to answer "what depends on what".
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

export type UnrealModuleType =
  | 'Runtime'
  | 'Editor'
  | 'Developer'
  | 'Program'
  | 'Server'
  | 'Client'
  | 'Unknown';

export interface UnrealModuleInfo {
  name: string;
  type: UnrealModuleType;
  /** Project-relative path of the Build.cs file. */
  buildCsRel: string;
  publicDeps: string[];
  privateDeps: string[];
}

export interface UnrealTargetInfo {
  name: string;
  /** "Game" | "Editor" | "Server" | "Client" | "Program" | "Unknown" */
  type: string;
  /** Project-relative path of the Target.cs file. */
  targetCsRel: string;
  extraModuleNames: string[];
}

export interface UnrealProjectGraph {
  projectName: string;
  engineAssociation?: string;
  declaredModules: { name: string; type: UnrealModuleType; loadingPhase?: string }[];
  modules: UnrealModuleInfo[];
  targets: UnrealTargetInfo[];
}

export function buildUprojectGraph(projectRoot: string): UnrealProjectGraph {
  const uprojectName = readdirSync(projectRoot).find((f) => f.endsWith('.uproject'));
  if (!uprojectName) throw new Error(`No .uproject under ${projectRoot}`);
  const uprojectPath = join(projectRoot, uprojectName);
  const projectName = uprojectName.replace(/\.uproject$/, '');

  let engineAssociation: string | undefined;
  let declaredModules: UnrealProjectGraph['declaredModules'] = [];
  try {
    const raw = readFileSync(uprojectPath, 'utf8');
    const json = JSON.parse(raw) as {
      EngineAssociation?: string;
      Modules?: { Name?: string; Type?: string; LoadingPhase?: string }[];
    };
    engineAssociation = json.EngineAssociation;
    declaredModules = (json.Modules ?? [])
      .filter((m) => typeof m.Name === 'string')
      .map((m) => ({
        name: m.Name as string,
        type: normaliseModuleType(m.Type),
        loadingPhase: m.LoadingPhase,
      }));
  } catch {
    /* ignore parse errors — projects with comments etc. */
  }

  const sourceDir = join(projectRoot, 'Source');
  const csFiles: string[] = [];
  if (existsSync(sourceDir)) walkCs(sourceDir, csFiles);

  const modules: UnrealModuleInfo[] = [];
  const targets: UnrealTargetInfo[] = [];
  for (const file of csFiles) {
    const lower = file.toLowerCase();
    const rel = relative(projectRoot, file).replace(/\\/g, '/');
    if (lower.endsWith('.build.cs')) {
      modules.push(parseBuildCs(file, rel));
    } else if (lower.endsWith('.target.cs')) {
      targets.push(parseTargetCs(file, rel));
    }
  }

  return { projectName, engineAssociation, declaredModules, modules, targets };
}

function walkCs(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkCs(full, out);
    else if (full.toLowerCase().endsWith('.cs')) out.push(full);
  }
}

function parseBuildCs(full: string, rel: string): UnrealModuleInfo {
  const name = basename(full).replace(/\.Build\.cs$/i, '');
  const text = readFileSync(full, 'utf8');
  const publicDeps = extractAddRange(
    text,
    /Public(?:Dependency)?ModuleNames\s*\.\s*AddRange\s*\(\s*new\s+string\s*\[\s*\]\s*\{([^}]*)\}\s*\)/g,
  );
  const privateDeps = extractAddRange(
    text,
    /Private(?:Dependency)?ModuleNames\s*\.\s*AddRange\s*\(\s*new\s+string\s*\[\s*\]\s*\{([^}]*)\}\s*\)/g,
  );
  return {
    name,
    type: 'Runtime', // Build.cs alone doesn't carry type — refined later from .uproject
    buildCsRel: rel,
    publicDeps,
    privateDeps,
  };
}

function parseTargetCs(full: string, rel: string): UnrealTargetInfo {
  const name = basename(full).replace(/\.Target\.cs$/i, '');
  const text = readFileSync(full, 'utf8');
  // `Type = TargetType.Game;`
  const typeMatch = /Type\s*=\s*TargetType\.(\w+)/.exec(text);
  const extra = extractAddRange(
    text,
    /ExtraModuleNames\s*\.\s*AddRange\s*\(\s*new\s+string\s*\[\s*\]\s*\{([^}]*)\}\s*\)/g,
  );
  return {
    name,
    type: typeMatch ? typeMatch[1]! : 'Unknown',
    targetCsRel: rel,
    extraModuleNames: extra,
  };
}

function extractAddRange(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inside = m[1] ?? '';
    const parts = inside
      .split(',')
      .map((p) => p.trim())
      .map((p) => p.replace(/^"|"$/g, ''))
      .filter((p) => p.length > 0);
    for (const p of parts) {
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

function normaliseModuleType(s: string | undefined): UnrealModuleType {
  switch ((s ?? '').toLowerCase()) {
    case 'runtime':
      return 'Runtime';
    case 'editor':
      return 'Editor';
    case 'developer':
      return 'Developer';
    case 'program':
      return 'Program';
    case 'server':
      return 'Server';
    case 'client':
      return 'Client';
    default:
      return 'Unknown';
  }
}
