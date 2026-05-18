import type { SceneAnalysis } from './scene-parser.js';

export interface SceneOptimizeSuggestion {
  severity: 'warn' | 'info';
  message: string;
}

export function analyzeSceneOptimizations(analysis: SceneAnalysis): SceneOptimizeSuggestion[] {
  const suggestions: SceneOptimizeSuggestion[] = [];

  if (analysis.maxDepth > 8) {
    suggestions.push({
      severity: 'warn',
      message: `Hierarchy depth ${analysis.maxDepth} is high — consider flattening UI trees`,
    });
  }

  const inactive = analysis.nodes.filter((n) => !n.active);
  if (inactive.length) {
    suggestions.push({
      severity: 'info',
      message: `${inactive.length} inactive node(s): ${inactive.map((n) => n.path).join(', ')}`,
    });
  }

  const noComponents = analysis.nodes.filter(
    (n) => n.childCount === 0 && n.componentTypes.length === 0,
  );
  if (noComponents.length) {
    suggestions.push({
      severity: 'info',
      message: `${noComponents.length} leaf node(s) without components`,
    });
  }

  if (analysis.nodeCount > 200) {
    suggestions.push({
      severity: 'warn',
      message: `Large scene (${analysis.nodeCount} nodes) — split or use prefabs`,
    });
  }

  return suggestions;
}
