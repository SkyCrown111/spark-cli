import * as esbuild from 'esbuild';
import { cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const watch = process.argv.includes('--watch');
const root = dirname(fileURLToPath(import.meta.url));

/** Bundle app code; keep npm dependencies external (Node resolves from node_modules). */
const ctx = await esbuild.context({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: { js: '#!/usr/bin/env node' },
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('built dist/cli.js');

  const srcKb = join(root, '..', 'knowledge');
  const destKb = join(root, '..', 'dist', 'knowledge');
  if (existsSync(srcKb)) {
    cpSync(srcKb, destKb, { recursive: true });
    console.log('copied knowledge/ → dist/knowledge/');
  }

  const srcSkills = join(root, '..', 'skills');
  const destSkills = join(root, '..', 'dist', 'skills');
  if (existsSync(srcSkills)) {
    cpSync(srcSkills, destSkills, { recursive: true });
    console.log('copied skills/ → dist/skills/');
  }

  const srcRules = join(root, '..', 'rules');
  const destRules = join(root, '..', 'dist', 'rules');
  if (existsSync(srcRules)) {
    cpSync(srcRules, destRules, { recursive: true });
    console.log('copied rules/ → dist/rules/');
  }

  const srcEditor = join(root, '..', 'editor', 'public');
  const destEditor = join(root, '..', 'dist', 'editor', 'public');
  if (existsSync(srcEditor)) {
    cpSync(srcEditor, destEditor, { recursive: true });
    console.log('copied editor/public → dist/editor/public');
  }
}
