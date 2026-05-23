import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import {
  buildKnowledgeIndex,
  getBuiltinKnowledgeDir,
  loadIndex,
  saveIndex,
} from '../core/knowledge/indexer.js';
import { searchKnowledge } from '../core/knowledge/retriever.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { getProjectSparkDir } from '../config/paths.js';

function knowledgeDirs(projectRoot: string): string[] {
  const dirs = [getBuiltinKnowledgeDir()];
  const projectKb = join(projectRoot, 'knowledge');
  const sparkKb = join(getProjectSparkDir(projectRoot), 'knowledge');
  if (existsSync(projectKb)) dirs.push(projectKb);
  if (existsSync(sparkKb)) dirs.push(sparkKb);
  return dirs;
}

export function runKnowledgeIndex(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const index = buildKnowledgeIndex(knowledgeDirs(root));
  const path = saveIndex(root, index);

  if (opts.json) {
    printJson({ path, chunks: index.chunks.length, builtAt: index.builtAt });
    return;
  }
  logger.info(chalk.green('✓'), `Indexed ${index.chunks.length} chunks`);
  logger.info(chalk.dim(`  ${path}`));
}

export function runKnowledgeSearch(opts: GlobalOptions, query: string): void {
  const root = resolveProjectRoot(opts);
  let index = loadIndex(root);
  if (!index) {
    runKnowledgeIndex(opts);
    index = loadIndex(root)!;
  }

  const hits = searchKnowledge(index, query);

  if (opts.json) {
    printJson({
      query,
      hits: hits.map((h) => ({
        score: h.score,
        source: h.chunk.source,
        title: h.chunk.title,
        text: h.chunk.text.slice(0, 500),
      })),
    });
    return;
  }

  logger.info(chalk.bold(`\nKnowledge: "${query}"\n`));
  if (!hits.length) {
    logger.info(chalk.dim('  No matches. Try: spark-cli knowledge index'));
    return;
  }
  for (const h of hits) {
    logger.info(
      chalk.cyan(`${h.score.toFixed(2)}`),
      chalk.white(h.chunk.title),
      chalk.dim(`(${h.chunk.source})`),
    );
    logger.info(chalk.dim(h.chunk.text.slice(0, 200).replace(/\n/g, ' ') + '...\n'));
  }
}

export function runKnowledgeAdd(opts: GlobalOptions, filePath: string, title?: string): void {
  const root = resolveProjectRoot(opts);
  const destDir = join(getProjectSparkDir(root), 'knowledge');
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  const base = filePath.split(/[/\\]/).pop() ?? 'note.md';
  const dest = join(destDir, title ? `${title}.md` : base);
  copyFileSync(filePath, dest);
  if (opts.json) {
    printJson({ added: dest });
    return;
  }
  logger.info(chalk.green('✓'), 'Added', chalk.cyan(dest));
  logger.info(chalk.dim('  Run: spark-cli knowledge index'));
}
