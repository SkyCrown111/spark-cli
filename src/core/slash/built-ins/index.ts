/**
 * Built-in slash commands — assembled from domain sub-modules.
 */

import type { SlashCommand } from '../registry.js';
import { buildCoreCommands } from './core.js';
import { buildStagingCommands } from './staging.js';
import { buildSessionCommands } from './session.js';
import { buildConfigCommands } from './config.js';
import { buildAgentCommands } from './agent.js';
import { buildMcpCommands } from './mcp.js';

export type { ExtendedOutcome, StatefulOutcome } from './types.js';

export function buildBuiltinCommands(): SlashCommand[] {
  return [
    ...buildCoreCommands(),
    ...buildStagingCommands(),
    ...buildSessionCommands(),
    ...buildConfigCommands(),
    ...buildAgentCommands(),
    ...buildMcpCommands(),
  ];
}
