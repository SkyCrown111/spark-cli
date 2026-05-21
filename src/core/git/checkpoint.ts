/**
 * Git-based checkpoint / rewind for SparkCLI sessions.
 *
 * Uses `git stash` to snapshot the working tree before risky operations,
 * allowing the user to rewind to a known-good state.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';

export interface Checkpoint {
  id: string;
  timestamp: string;
  stashRef?: string;
}

function checkpointDir(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'checkpoints');
}

function checkpointIndexPath(projectRoot: string): string {
  return join(checkpointDir(projectRoot), 'index.json');
}

function loadCheckpointIndex(projectRoot: string): Checkpoint[] {
  const path = checkpointIndexPath(projectRoot);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Checkpoint[];
  } catch {
    return [];
  }
}

function saveCheckpointIndex(projectRoot: string, checkpoints: Checkpoint[]): void {
  const dir = checkpointDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(checkpointIndexPath(projectRoot), JSON.stringify(checkpoints, null, 2));
}

/**
 * Create a checkpoint by stashing the current working tree.
 *
 * @returns The checkpoint metadata including a unique ID and timestamp.
 */
export async function createCheckpoint(
  projectRoot: string,
): Promise<{ id: string; timestamp: string }> {
  const id = `cp-${Date.now().toString(36)}`;
  const timestamp = new Date().toISOString();

  let stashRef: string | undefined;

  try {
    // Stash with a marker message so we can find it later
    const stashMessage = `spark-cli-checkpoint:${id}`;
    execSync(`git stash push -m ${JSON.stringify(stashMessage)}`, {
      cwd: projectRoot,
      stdio: 'pipe',
    });

    // Find the stash ref we just created
    const stashList = execSync('git stash list', {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    const match = stashList.split('\n').find((line) => line.includes(stashMessage));
    if (match) {
      const refMatch = match.match(/^(stash@\{\d+\})/);
      if (refMatch) stashRef = refMatch[1];
    }
  } catch {
    // Nothing to stash or git error — checkpoint still records the timestamp
  }

  const checkpoint: Checkpoint = { id, timestamp, stashRef };
  const index = loadCheckpointIndex(projectRoot);
  index.push(checkpoint);
  saveCheckpointIndex(projectRoot, index);

  return { id, timestamp };
}

/**
 * Rewind to a specific checkpoint by popping its stash entry.
 *
 * @returns True if the rewind succeeded, false otherwise.
 */
export async function rewindToCheckpoint(
  projectRoot: string,
  checkpointId: string,
): Promise<boolean> {
  const index = loadCheckpointIndex(projectRoot);
  const checkpoint = index.find((c) => c.id === checkpointId);
  if (!checkpoint) return false;

  if (!checkpoint.stashRef) {
    // No stash was created (working tree was clean at checkpoint time)
    return true;
  }

  try {
    execSync(`git stash pop ${checkpoint.stashRef}`, {
      cwd: projectRoot,
      stdio: 'pipe',
    });

    // Remove the checkpoint from the index after successful rewind
    const updated = index.filter((c) => c.id !== checkpointId);
    saveCheckpointIndex(projectRoot, updated);

    return true;
  } catch {
    return false;
  }
}

/**
 * List all checkpoints for the current project.
 */
export function listCheckpoints(projectRoot: string): Checkpoint[] {
  return loadCheckpointIndex(projectRoot);
}

/**
 * Remove a checkpoint from the index without popping the stash.
 */
export function discardCheckpoint(
  projectRoot: string,
  checkpointId: string,
): boolean {
  const index = loadCheckpointIndex(projectRoot);
  const found = index.some((c) => c.id === checkpointId);
  if (!found) return false;

  const updated = index.filter((c) => c.id !== checkpointId);
  saveCheckpointIndex(projectRoot, updated);
  return true;
}
