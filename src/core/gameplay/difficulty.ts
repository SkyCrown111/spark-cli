/**
 * Suggest next-level combat numbers from prior level metrics.
 */

export interface LevelMetrics {
  id: string;
  enemyHp: number;
  enemyDamage: number;
  enemyCount: number;
}

export interface DifficultySuggestion {
  nextId: string;
  enemyHp: number;
  enemyDamage: number;
  enemyCount: number;
  curve: 'linear' | 'exponential-soft';
  rationale: string;
}

export function suggestNextLevel(
  levels: LevelMetrics[],
  curve: 'linear' | 'exponential-soft' = 'exponential-soft',
): DifficultySuggestion {
  if (levels.length === 0) {
    return {
      nextId: 'level-1',
      enemyHp: 100,
      enemyDamage: 10,
      enemyCount: 3,
      curve,
      rationale: 'No prior levels — starter defaults',
    };
  }
  const last = levels[levels.length - 1]!;
  const factor = curve === 'linear' ? 1.12 : 1.18;
  const hp = Math.round(last.enemyHp * factor);
  const dmg = Math.round(last.enemyDamage * (factor - 0.03));
  const count = Math.min(last.enemyCount + 1, 24);
  return {
    nextId: `level-${levels.length + 1}`,
    enemyHp: hp,
    enemyDamage: dmg,
    enemyCount: count,
    curve,
    rationale: `Scaled from ${last.id} by ×${factor.toFixed(2)}`,
  };
}
