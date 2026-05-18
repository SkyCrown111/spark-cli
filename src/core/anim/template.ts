import type { AnimGraph, AnimState, AnimTransition } from './types.js';

function slug(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'controller';
}

/** Parse "Idle→Run→Jump" or "Idle->Run" chains. */
export function parseStateChain(spec: string): string[] {
  const parts = spec
    .split(/→|->|>|,|、/)
    .map((s) => s.replace(/[，,、].*$/, '').replace(/\s+.*$/, '').trim())
    .filter(Boolean);
  return parts.length ? parts : ['Idle', 'Run'];
}

export function buildAnimTemplate(name: string, spec: string): AnimGraph {
  const states: AnimState[] = parseStateChain(spec).map((id) => ({
    id,
    motion: id.toLowerCase(),
    speed: 1,
  }));

  const transitions: AnimTransition[] = [];
  for (let i = 0; i < states.length - 1; i++) {
    transitions.push({
      from: states[i]!.id,
      to: states[i + 1]!.id,
      condition: i === 0 ? 'Speed > 0.1' : `${states[i]!.id}Complete`,
      duration: 0.15,
    });
  }
  if (states.length > 1) {
    transitions.push({
      from: states[states.length - 1]!.id,
      to: states[0]!.id,
      condition: 'Speed < 0.05',
      duration: 0.2,
    });
  }

  const hasGround = /地面|ground|jump/i.test(spec);
  const parameters = hasGround
    ? [
        { name: 'Speed', type: 'float' as const, default: 0 },
        { name: 'IsGrounded', type: 'bool' as const, default: true },
        { name: 'Jump', type: 'trigger' as const },
      ]
    : [{ name: 'Speed', type: 'float' as const, default: 0 }];

  return {
    version: 1,
    name: slug(name),
    parameters,
    states,
    transitions,
    meta: { generatedBy: 'spark-cli', spec: spec.slice(0, 500) },
  };
}

export function defaultAnimJsonPath(name: string): string {
  return `assets/anim/${slug(name)}.controller.json`;
}

export function defaultAnimScriptPath(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9]/g, '');
  return `assets/scripts/anim/${base}Controller.ts`;
}

export function buildCocosAnimControllerScript(graph: AnimGraph, _jsonRelPath: string): string {
  const className =
    graph.name
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('') || 'Anim';

  return `// @spark-cli-generated
// path: assets/scripts/anim/${className}Controller.ts
import { _decorator, Component, JsonAsset } from 'cc';
const { ccclass } = _decorator;

type AnimStateId = ${graph.states.map((s) => `'${s.id}'`).join(' | ') || "'Idle'"};

@ccclass('${className}Controller')
export class ${className}Controller extends Component {
  graphAsset: JsonAsset | null = null;

  state: AnimStateId = '${graph.states[0]?.id ?? 'Idle'}';
  speed = 0;

  private graph = ${JSON.stringify(graph, null, 2)};

  update(dt: number) {
    const speed = this.speed;
    for (const t of this.graph.transitions) {
      if (t.from !== this.state) continue;
      if (t.condition === 'Speed > 0.1' && speed > 0.1) {
        this.state = t.to as AnimStateId;
        break;
      }
      if (t.condition === 'Speed < 0.05' && speed < 0.05) {
        this.state = t.to as AnimStateId;
        break;
      }
    }
  }
}
`;
}
