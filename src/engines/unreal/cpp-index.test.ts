import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { indexUnrealCppDir, parseCppFile, findUClass, listUFunctions } from './cpp-index.js';

const FIXTURE = join(process.cwd(), 'fixtures', 'unreal-mini');

describe('parseCppFile (regex fallback)', () => {
  it('finds UCLASS + GENERATED_BODY in the fixture header', () => {
    const out = parseCppFile(FIXTURE, join(FIXTURE, 'Source', 'SparkCLI', 'SampleActor.h'));
    expect(out.uclasses).toHaveLength(1);
    expect(out.uclasses[0]!.name).toBe('ASampleActor');
    expect(out.uclasses[0]!.base).toBe('AActor');
    expect(out.uclasses[0]!.hasGeneratedBody).toBe(true);
  });
});

describe('indexUnrealCppDir', () => {
  it('walks Source/ recursively and indexes every .h/.cpp', () => {
    const entries = indexUnrealCppDir(FIXTURE);
    const sample = findUClass(entries, 'ASampleActor');
    expect(sample).toBeDefined();
  });

  it('lists UFUNCTIONs from files declaring the class', () => {
    let tmp: string | undefined;
    try {
      tmp = mkdtempSync(join(tmpdir(), 'gcli-cppindex-'));
      mkdirSync(join(tmp, 'Source', 'M'), { recursive: true });
      writeFileSync(
        join(tmp, 'Source', 'M', 'X.h'),
        `
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

UCLASS(BlueprintType)
class M_API AThing : public AActor {
  GENERATED_BODY()
public:
  UFUNCTION(BlueprintCallable, Category="Foo")
  void DoIt();

  UPROPERTY(EditAnywhere, Category="Foo")
  int32 Count;
};
`,
        'utf8',
      );
      const entries = indexUnrealCppDir(tmp);
      const fns = listUFunctions(entries, 'AThing');
      expect(fns.find((f) => f.name === 'DoIt')).toBeDefined();
      const klass = findUClass(entries, 'AThing');
      expect(klass?.specifiers).toContain('BlueprintType');
      const props = entries.flatMap((e) => e.uproperties);
      expect(props.find((p) => p.name === 'Count')).toBeDefined();
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  });
});
