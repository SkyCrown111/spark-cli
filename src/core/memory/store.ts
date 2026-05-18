import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';

export interface MemoryEntry {
  key: string;
  value: string;
  createdAt: string;
}

export interface MemoryFile {
  entries: MemoryEntry[];
}

function sessionPath(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'memory', 'session.json');
}

function projectPath(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'memory', 'project.json');
}

function loadFile(path: string): MemoryFile {
  if (!existsSync(path)) return { entries: [] };
  return JSON.parse(readFileSync(path, 'utf8')) as MemoryFile;
}

function saveFile(path: string, data: MemoryFile): void {
  const dir = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

export function getSessionMemory(projectRoot: string): MemoryFile {
  return loadFile(sessionPath(projectRoot));
}

export function getProjectMemory(projectRoot: string): MemoryFile {
  return loadFile(projectPath(projectRoot));
}

export function addProjectMemory(
  projectRoot: string,
  key: string,
  value: string,
): void {
  const path = projectPath(projectRoot);
  const data = loadFile(path);
  const existing = data.entries.findIndex((e) => e.key === key);
  const entry: MemoryEntry = {
    key,
    value,
    createdAt: new Date().toISOString(),
  };
  if (existing >= 0) data.entries[existing] = entry;
  else data.entries.push(entry);
  saveFile(path, data);
}

export function clearSessionMemory(projectRoot: string): void {
  saveFile(sessionPath(projectRoot), { entries: [] });
}

export function clearProjectMemory(projectRoot: string): void {
  saveFile(projectPath(projectRoot), { entries: [] });
}

export function clearAllMemory(projectRoot: string): void {
  clearSessionMemory(projectRoot);
  clearProjectMemory(projectRoot);
}

export function formatMemoryForPrompt(projectRoot: string): string {
  const project = getProjectMemory(projectRoot);
  const session = getSessionMemory(projectRoot);
  const lines: string[] = [];
  if (project.entries.length) {
    lines.push('## Project memory (confirmed facts)');
    for (const e of project.entries) {
      lines.push(`- ${e.key}: ${e.value}`);
    }
  }
  if (session.entries.length) {
    lines.push('## Session memory');
    for (const e of session.entries) {
      lines.push(`- ${e.key}: ${e.value}`);
    }
  }
  return lines.join('\n');
}
