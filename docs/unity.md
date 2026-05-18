# Unity support (Phase 6)

## Project layout

SparkCLI detects Unity when both exist:

- `Assets/`
- `ProjectSettings/ProjectVersion.txt`

## Workflow: gen → apply → validate

```bash
cd your-unity-project
spark-cli init                    # sets engine: unity if detected
spark-cli model use openai/gpt-4o # or your provider

spark-cli gen --type component "player movement WASD"
spark-cli diff
spark-cli apply                   # writes staged C# to Assets/Scripts/...
spark-cli validate                # runs dotnet build on .sln / .csproj
```

Generated files use `csharp` fences and paths like `Assets/Scripts/MyScript.cs`.

### Apply from Unity Editor

1. Copy `packages/unity/com.spark-cli.bridge` into your project's `Packages/` folder  
   (or add via `manifest.json` local path).
2. After `spark-cli gen` / `chat` stages files, open Unity.
3. Menu **SparkCLI → Apply Staging** (same result as `spark-cli apply`).

## Validate

For Unity projects, `spark-cli validate`:

- Runs `dotnet build` on the first `.sln` or `.csproj` in the project root
- Skips Cocos `tsc` and `scene_integrity`

Install [.NET SDK](https://dotnet.microsoft.com/download) for CLI validation.

## Fixture (CI / no Unity install)

`fixtures/unity-mini/` is a minimal Unity-like tree with:

- `SparkCLI.sln` + `SparkCLI.csproj`
- `Stubs/UnityEngine/` for compile without Unity assemblies
- `Assets/Scripts/SparkCLI_Sample.cs`

```bash
cd fixtures/unity-mini
dotnet build
node ../../dist/cli.js validate --json
```

## Config

```yaml
project:
  engine: unity
  unityPath: 'C:/Program Files/Unity/Hub/Editor/2022.3.20f1/Editor/Unity.exe'
```

## gen / chat / ui

LLM prompts automatically target C# + `MonoBehaviour` when `engine: unity` or Unity layout is detected.
