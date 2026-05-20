import { describe, it, expect } from 'vitest';
import { isTreeSitterCppAvailable, parseCppOutlineAst } from './cpp-index-ast.js';

const SAMPLE = `
UCLASS(BlueprintType)
class M_API AThing : public AActor {
  GENERATED_BODY()
public:
  UFUNCTION(BlueprintCallable, Category="Foo")
  void DoIt();

  UPROPERTY(EditAnywhere, Category="Foo")
  int32 Count;
};
`;

describe('parseCppOutlineAst', () => {
  it('returns null when tree-sitter is not installed', () => {
    if (isTreeSitterCppAvailable()) return;
    expect(parseCppOutlineAst(SAMPLE)).toBeNull();
  });

  it('extracts UCLASS/UFUNCTION/UPROPERTY when tree-sitter is installed', () => {
    if (!isTreeSitterCppAvailable()) return;
    const out = parseCppOutlineAst(SAMPLE);
    expect(out).not.toBeNull();
    expect(out!.uclasses.some((c) => c.name === 'AThing')).toBe(true);
    expect(out!.ufunctions.some((f) => f.name === 'DoIt')).toBe(true);
    expect(out!.uproperties.some((p) => p.name === 'Count')).toBe(true);
  });
});
