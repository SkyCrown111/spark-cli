/** Structured user prompts for REPL shortcuts and `gen`/`ui --agent`. */

export function buildGenAgentPrompt(prompt: string, type?: string): string {
  const hint = type ? ` Focus on a ${type} (component/system) for the detected engine.` : '';
  return (
    `Generate game code for this project.${hint}\n\n` +
    `Use tools to read existing files, then write through staging.\n\n` +
    `Request:\n${prompt || '(describe what to build)'}`
  );
}

export function buildUiAgentPrompt(prompt: string): string {
  return (
    `Generate or update UI layout/scripts for this game project.\n` +
    `Match existing engine UI patterns (Cocos prefabs, Unity uGUI, Godot Control, etc.).\n\n` +
    `Request:\n${prompt || '(describe the UI)'}`
  );
}

export function buildLevelAgentPrompt(name: string, hint?: string): string {
  return (
    `Create or edit level data for "${name}".` +
    (hint ? ` Context: ${hint}` : '') +
    `\nPrefer level JSON under .spark-cli/ or engine-appropriate assets; stage changes.`
  );
}

export function buildAnimAgentPrompt(name: string, spec?: string): string {
  return (
    `Create or edit animation/state-machine data for "${name}".` +
    (spec ? ` Spec: ${spec}` : '') +
    `\nStage outputs; match the project's engine conventions.`
  );
}
