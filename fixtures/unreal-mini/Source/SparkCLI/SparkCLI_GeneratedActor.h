// @gamecli-generated
// path: Source/SparkCLI/SparkCLI_GeneratedActor.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SparkCLI_GeneratedActor.generated.h"

UCLASS()
class GAMECLI_API SparkCLI_GeneratedActor : public AActor
{
  GENERATED_BODY()

public:
  SparkCLI_GeneratedActor();

  /** patrol actor */
  UFUNCTION(BlueprintCallable, Category = "SparkCLI")
  void OnSparkCLIInit();
};
