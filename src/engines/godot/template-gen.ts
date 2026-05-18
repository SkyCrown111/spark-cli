import { initStaging, stageWriteFile } from '../../core/staging/patch-manager.js';

export function stageGodotTemplateGen(projectRoot: string, prompt: string): { files: string[] } {
  const path = 'scripts/spark-cli_generated.gd';
  const content = `# @spark-cli-generated
# path: ${path}
extends Node

## ${prompt.slice(0, 200).replace(/\n/g, ' ')}

func _ready() -> void:
\tprint("[SparkCLI] generated: ", "${prompt.slice(0, 60).replace(/"/g, "'")}")
`;

  initStaging(projectRoot);
  stageWriteFile(projectRoot, path, content);
  return { files: [path] };
}
