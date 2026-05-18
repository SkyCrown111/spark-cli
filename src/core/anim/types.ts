export interface AnimParameter {
  name: string;
  type: 'float' | 'bool' | 'int' | 'trigger';
  default?: number | boolean;
}

export interface AnimState {
  id: string;
  motion?: string;
  speed?: number;
}

export interface AnimTransition {
  from: string;
  to: string;
  condition?: string;
  duration?: number;
}

export interface AnimGraph {
  version: 1;
  name: string;
  parameters: AnimParameter[];
  states: AnimState[];
  transitions: AnimTransition[];
  meta?: Record<string, string>;
}

export function validateAnimGraph(data: unknown): data is AnimGraph {
  if (!data || typeof data !== 'object') return false;
  const g = data as AnimGraph;
  return g.version === 1 && typeof g.name === 'string' && Array.isArray(g.states);
}
