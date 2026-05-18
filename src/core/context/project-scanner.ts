import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { detectEngine } from '../../engines/registry.js';

const MAX_FILES = 24;
const MAX_FILE_BYTES = 12_000;
const MAX_TOTAL_BYTES = 48_000;

export interface ProjectContext {
  engine: string;
  engineVersion?: string;
  scriptPaths: string[];
  snippets: { path: string; content: string }[];
  summary: string;
}

function walkScripts(
  dir: string,
  root: string,
  out: string[],
  ext: '.ts' | '.cs' | '.gd' | '.cpp' | '.h',
): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (out.length >= MAX_FILES) return;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walkScripts(full, root, out, ext);
    } else if (ext === '.ts' && name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      out.push(relative(root, full).replace(/\\/g, '/'));
    } else if (ext === '.cs' && name.endsWith('.cs')) {
      out.push(relative(root, full).replace(/\\/g, '/'));
    } else if (ext === '.gd' && name.endsWith('.gd')) {
      out.push(relative(root, full).replace(/\\/g, '/'));
    } else if ((ext === '.cpp' || ext === '.h') && (name.endsWith('.cpp') || name.endsWith('.h'))) {
      out.push(relative(root, full).replace(/\\/g, '/'));
    }
  }
}

export function scanProjectContext(projectRoot: string): ProjectContext {
  const detected = detectEngine(projectRoot);
  const engine = detected.id;

  let scriptDir: string;
  let ext: '.ts' | '.cs' | '.gd' | '.cpp' | '.h';
  let scriptLabel: string;

  switch (engine) {
    case 'unity':
      scriptDir = join(projectRoot, 'Assets', 'Scripts');
      ext = '.cs';
      scriptLabel = 'C# files under Assets/Scripts';
      break;
    case 'unreal':
      scriptDir = join(projectRoot, 'Source');
      ext = '.cpp';
      scriptLabel = 'C++ sources under Source/';
      break;
    case 'godot':
      scriptDir = join(projectRoot, 'scripts');
      ext = '.gd';
      scriptLabel = 'GDScript files under scripts/';
      break;
    default:
      scriptDir = join(projectRoot, 'assets', 'scripts');
      ext = '.ts';
      scriptLabel = 'TypeScript files under assets/scripts';
  }

  const scriptPaths: string[] = [];
  walkScripts(scriptDir, projectRoot, scriptPaths, ext);

  const snippets: { path: string; content: string }[] = [];
  let total = 0;
  for (const rel of scriptPaths.slice(0, MAX_FILES)) {
    if (total >= MAX_TOTAL_BYTES) break;
    const full = join(projectRoot, rel);
    try {
      const raw = readFileSync(full, 'utf8');
      const slice = raw.slice(0, MAX_FILE_BYTES);
      snippets.push({ path: rel, content: slice });
      total += slice.length;
    } catch {
      /* skip */
    }
  }

  const summary = [
    `Engine: ${engine}${detected.version ? ` ${detected.version}` : ''}`,
    `${scriptLabel}: ${scriptPaths.length}`,
    scriptPaths.length
      ? `Sample paths: ${scriptPaths.slice(0, 8).join(', ')}`
      : 'No existing scripts yet — greenfield generation.',
  ].join('\n');

  return {
    engine,
    engineVersion: detected.version,
    scriptPaths,
    snippets,
    summary,
  };
}

export function formatContextForPrompt(ctx: ProjectContext): string {
  const lang =
    ctx.engine === 'unity'
      ? 'csharp'
      : ctx.engine === 'godot'
        ? 'gdscript'
        : ctx.engine === 'unreal'
          ? 'cpp'
          : 'typescript';
  const parts = [`## Project\n${ctx.summary}`];
  if (ctx.snippets.length) {
    parts.push('## Existing scripts (excerpt)');
    for (const s of ctx.snippets.slice(0, 6)) {
      parts.push(`### ${s.path}\n\`\`\`${lang}\n${s.content}\n\`\`\``);
    }
  }
  return parts.join('\n\n');
}
