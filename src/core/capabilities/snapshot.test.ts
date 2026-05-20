import { describe, it, expect } from 'vitest';
import { buildCapabilitySnapshot } from './snapshot.js';
import type { SparkCLIConfig } from '../../config/schema.js';
import { isTreeSitterCppOperational } from '../../engines/unreal/cpp-index-ast.js';

describe('buildCapabilitySnapshot', () => {
  it('reports mock image gen when disabled', () => {
    const snap = buildCapabilitySnapshot({} as SparkCLIConfig);
    expect(snap.imageGen.effectiveProvider).toBe('mock');
    expect(snap.unrealCppIndex.backend).toBe(
      isTreeSitterCppOperational() ? 'tree-sitter' : 'regex',
    );
  });

  it('flags invalid subagent.model', () => {
    const snap = buildCapabilitySnapshot({
      subagent: { model: 'no-such-provider/no-model' },
    } as SparkCLIConfig);
    expect(snap.subagent.modelResolveOk).toBe(false);
    expect(snap.subagent.modelResolveMessage).toBeTruthy();
  });
});
