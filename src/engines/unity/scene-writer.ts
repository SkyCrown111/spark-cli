/**
 * Stage Unity scene-graph mutations under `.spark-cli/staging/<scene>`.
 *
 * Mirrors `engines/cocos/scene-writer.ts`: every write goes through
 * `stageWriteFile` so nothing touches the real `Assets/*.unity` until the user
 * runs `spark-cli apply`.
 */

import { join } from 'node:path';
import { stageWriteFile } from '../../core/staging/patch-manager.js';
import {
  parseUnityScene,
  setProperty,
  addComponent,
  type AddComponentInput,
} from './scene-graph.js';
import {
  setNestedProperty,
  removeComponent,
  replacePrefabInstance,
  type PrefabReplaceInput,
} from './scene-writer-nested.js';

export interface UnityWriteResult {
  staged: string;
  fileId: string;
  changed: boolean;
}

export function setUnitySceneProperty(
  projectRoot: string,
  scenePath: string,
  fileId: string,
  key: string,
  value: string,
): UnityWriteResult {
  const full = join(projectRoot, scenePath);
  const scene = parseUnityScene(full);
  const r = setProperty(scene, fileId, key, value);
  stageWriteFile(projectRoot, scenePath, r.text);
  return { staged: scenePath, fileId, changed: r.changed };
}

export function addUnitySceneComponent(
  projectRoot: string,
  scenePath: string,
  input: AddComponentInput,
): UnityWriteResult {
  const full = join(projectRoot, scenePath);
  const scene = parseUnityScene(full);
  const text = addComponent(scene, input);
  stageWriteFile(projectRoot, scenePath, text);
  return { staged: scenePath, fileId: input.newFileId, changed: true };
}

export function setUnitySceneNestedProperty(
  projectRoot: string,
  scenePath: string,
  fileId: string,
  path: string,
  value: string,
): UnityWriteResult {
  const full = join(projectRoot, scenePath);
  const scene = parseUnityScene(full);
  const r = setNestedProperty(scene, fileId, path, value);
  stageWriteFile(projectRoot, scenePath, r.text);
  return { staged: scenePath, fileId, changed: r.changed };
}

export interface UnityRemoveComponentResult {
  staged: string;
  gameObjectFileId: string;
  removedComponentFileId: string;
}

export function removeUnitySceneComponent(
  projectRoot: string,
  scenePath: string,
  gameObjectFileId: string,
  componentFileId: string,
): UnityRemoveComponentResult {
  const full = join(projectRoot, scenePath);
  const scene = parseUnityScene(full);
  const r = removeComponent(scene, gameObjectFileId, componentFileId);
  stageWriteFile(projectRoot, scenePath, r.text);
  return {
    staged: scenePath,
    gameObjectFileId: r.removedFromGameObject,
    removedComponentFileId: r.removedComponentFileId,
  };
}

export interface UnityReplacePrefabResult {
  staged: string;
  instanceFileId: string;
  oldGuid: string | null;
  changed: boolean;
}

export function replaceUnityScenePrefabInstance(
  projectRoot: string,
  scenePath: string,
  input: PrefabReplaceInput,
): UnityReplacePrefabResult {
  const full = join(projectRoot, scenePath);
  const scene = parseUnityScene(full);
  const r = replacePrefabInstance(scene, input);
  stageWriteFile(projectRoot, scenePath, r.text);
  return {
    staged: scenePath,
    instanceFileId: input.instanceFileId,
    oldGuid: r.oldGuid,
    changed: r.changed,
  };
}
