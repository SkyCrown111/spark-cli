import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const steps = [
  ['typecheck', ['exec', 'tsc', '--noEmit']],
  ['unit tests', ['test']],
  ['build', ['run', 'build']],
];

let failed = 0;
for (const [label, args] of steps) {
  const r = spawnSync('pnpm', args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`✗ phase12: ${label} failed`);
    failed++;
  } else {
    console.log(`✓ phase12: ${label}`);
  }
}

if (!existsSync('CHANGELOG.md')) {
  console.error('✗ CHANGELOG.md missing');
  failed++;
}

if (!existsSync('docs/PHASE-12.md')) {
  console.error('✗ docs/PHASE-12.md missing');
  failed++;
}

process.exit(failed > 0 ? 1 : 0);
