import type { AnimGraph } from './types.js';

/** Export anim graph as a compact runtime JSON bundle for Cocos resources. */
export function exportAnimForCocos(graph: AnimGraph): string {
  const bundle = {
    format: 'spark-cli-anim-v1',
    name: graph.name,
    defaultState: graph.states[0]?.id ?? 'Idle',
    states: graph.states.map((s) => ({ id: s.id, clip: s.motion ?? s.id.toLowerCase() })),
    transitions: graph.transitions,
    parameters: graph.parameters,
  };
  return JSON.stringify(bundle, null, 2) + '\n';
}
