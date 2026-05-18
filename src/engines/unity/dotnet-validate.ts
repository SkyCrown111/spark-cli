import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function findDotnetProject(root: string): string | null {
  const sln = readdirSync(root).find((f) => f.endsWith('.sln'));
  if (sln) return join(root, sln);
  const csproj = readdirSync(root).find((f) => f.endsWith('.csproj'));
  if (csproj) return join(root, csproj);
  return null;
}

export function runDotnetBuild(projectRoot: string): {
  ok: boolean;
  message: string;
  project?: string;
} {
  if (!isDotnetAvailable()) {
    return { ok: true, message: 'skipped (dotnet SDK not installed)' };
  }

  const project = findDotnetProject(projectRoot);
  if (!project) {
    return { ok: true, message: 'skipped (no .sln or .csproj)' };
  }

  const r = spawnSync('dotnet', ['build', project, '--nologo', '-v', 'q'], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (r.status === 0) {
    return { ok: true, message: 'dotnet build passed', project };
  }

  const msg = (r.stderr || r.stdout || 'dotnet build failed').slice(0, 600);
  if (/No \.NET SDKs were found|SDK not found/i.test(msg)) {
    return { ok: true, message: 'skipped (dotnet SDK not installed)' };
  }
  return { ok: false, message: msg, project };
}

export function isDotnetAvailable(): boolean {
  const r = spawnSync('dotnet', ['--list-sdks'], { encoding: 'utf8', shell: true });
  return r.status === 0 && Boolean(r.stdout?.trim());
}
