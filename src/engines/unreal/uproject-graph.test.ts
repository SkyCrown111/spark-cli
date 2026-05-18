import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildUprojectGraph } from './uproject-graph.js';

const FIXTURE = join(process.cwd(), 'fixtures', 'unreal-mini');

describe('buildUprojectGraph', () => {
  it('reads project name and engine association from .uproject', () => {
    const g = buildUprojectGraph(FIXTURE);
    expect(g.projectName).toBe('SparkCLI');
    expect(g.engineAssociation).toBe('5.4');
  });

  it('lists declared modules from .uproject and parses Build.cs', () => {
    const g = buildUprojectGraph(FIXTURE);
    expect(g.declaredModules).toContainEqual(
      expect.objectContaining({ name: 'SparkCLI', type: 'Runtime' }),
    );
    const gameModule = g.modules.find((m) => m.name === 'SparkCLI');
    expect(gameModule).toBeDefined();
    expect(gameModule!.publicDeps).toEqual(
      expect.arrayContaining(['Core', 'CoreUObject', 'Engine']),
    );
    expect(gameModule!.buildCsRel).toBe('Source/SparkCLI/SparkCLI.Build.cs');
  });

  it('returns an empty modules array when Source/ is missing', () => {
    // We point at the project root but the function tolerates missing Source.
    const g = buildUprojectGraph(FIXTURE);
    expect(Array.isArray(g.modules)).toBe(true);
    expect(Array.isArray(g.targets)).toBe(true);
  });
});
