import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface UnrealProjectInfo {
  root: string;
  uprojectPath: string;
  projectName: string;
  version?: string;
}

export function detectUnrealProject(root: string): UnrealProjectInfo | null {
  if (!existsSync(root)) return null;
  const uproject = readdirSync(root).find((f) => f.endsWith('.uproject'));
  if (!uproject) return null;

  const uprojectPath = join(root, uproject);
  let version: string | undefined;
  try {
    const json = JSON.parse(readFileSync(uprojectPath, 'utf8')) as {
      EngineAssociation?: string;
    };
    version = json.EngineAssociation;
  } catch {
    /* ignore */
  }

  const source = join(root, 'Source');
  if (!existsSync(source)) return null;

  return {
    root,
    uprojectPath,
    projectName: uproject.replace(/\.uproject$/, ''),
    version,
  };
}
