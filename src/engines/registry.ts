import { detectCocosProject } from './cocos/detector.js';
import { detectUnityProject } from './unity/detector.js';
import { detectUnrealProject } from './unreal/detector.js';
import { detectGodotProject } from './godot/detector.js';

export type EngineId = 'cocos-creator' | 'unity' | 'unreal' | 'godot' | 'unknown';

export interface DetectedEngine {
  id: EngineId;
  version?: string;
}

export function detectEngine(root: string, configEngine?: string): DetectedEngine {
  if (
    configEngine === 'unreal' ||
    configEngine === 'godot' ||
    configEngine === 'unity' ||
    configEngine === 'cocos-creator'
  ) {
    const verified = verifyEngine(root, configEngine);
    if (verified) return verified;
  }

  const unreal = detectUnrealProject(root);
  if (unreal) return { id: 'unreal', version: unreal.version };

  const unity = detectUnityProject(root);
  if (unity) return { id: 'unity', version: unity.version };

  const godot = detectGodotProject(root);
  if (godot) return { id: 'godot', version: godot.version };

  const cocos = detectCocosProject(root);
  if (cocos) return { id: 'cocos-creator', version: cocos.version };

  return { id: 'unknown' };
}

function verifyEngine(root: string, engine: EngineId): DetectedEngine | null {
  if (engine === 'unreal') {
    const u = detectUnrealProject(root);
    return u ? { id: 'unreal', version: u.version } : null;
  }
  if (engine === 'godot') {
    const g = detectGodotProject(root);
    return g ? { id: 'godot', version: g.version } : null;
  }
  if (engine === 'unity') {
    const u = detectUnityProject(root);
    return u ? { id: 'unity', version: u.version } : null;
  }
  if (engine === 'cocos-creator') {
    const c = detectCocosProject(root);
    return c ? { id: 'cocos-creator', version: c.version } : null;
  }
  return null;
}
