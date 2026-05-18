import { describe, it, expect } from 'vitest';
import { csvToBalance, balanceToJson, jsonToBalance } from './balance.js';

describe('balance', () => {
  it('round-trips CSV to JSON', () => {
    const csv = 'id,hp,dmg\n1,100,10\n2,120,12\n';
    const rows = csvToBalance(csv);
    const json = balanceToJson(rows);
    const back = jsonToBalance(json);
    expect(back).toHaveLength(2);
    expect(back[0]!.id).toBe(1);
  });
});
