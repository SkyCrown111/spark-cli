import { initStaging, stageWriteFile } from '../../core/staging/patch-manager.js';
import { detectUnrealProject } from './detector.js';

export function stageUnrealTemplateGen(
  projectRoot: string,
  prompt: string,
): { files: string[] } {
  const info = detectUnrealProject(projectRoot);
  const module = info?.projectName ?? 'SparkCLI';
  const className = 'SparkCLI_GeneratedActor';

  const header = `// @spark-cli-generated
// path: Source/${module}/${className}.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "${className}.generated.h"

UCLASS()
class SPARKCLI_API ${className} : public AActor
{
  GENERATED_BODY()

public:
  ${className}();

  /** ${prompt.slice(0, 120).replace(/\n/g, ' ')} */
  UFUNCTION(BlueprintCallable, Category = "SparkCLI")
  void OnSparkCLIInit();
};
`;

  const cpp = `// @spark-cli-generated
// path: Source/${module}/${className}.cpp
#include "${className}.h"

${className}::${className}()
{
  PrimaryActorTick.bCanEverTick = false;
}

void ${className}::OnSparkCLIInit()
{
  UE_LOG(LogTemp, Log, TEXT("[SparkCLI] ${prompt.slice(0, 80).replace(/"/g, "'")}"));
}
`;

  const paths = [
    `Source/${module}/${className}.h`,
    `Source/${module}/${className}.cpp`,
  ];

  initStaging(projectRoot);
  stageWriteFile(projectRoot, paths[0]!, header);
  stageWriteFile(projectRoot, paths[1]!, cpp);

  return { files: paths };
}
