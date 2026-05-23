import { describe, it, expect } from 'vitest';
import {
  MASCOT_NAME,
  isMascotDisabled,
  pickSparkGreeting,
  renderSparkPixel,
  SPARK_GAMEPAD_LINES,
} from './mascot.js';
import { stripAnsi } from './terminal.js';

describe('Spark mascot', () => {
  it('has ASCII gamepad art in welcome card', () => {
    expect(MASCOT_NAME).toBe('Spark');
    expect(SPARK_GAMEPAD_LINES.length).toBeGreaterThan(3);
    const plain = stripAnsi(renderSparkPixel().join('\n'));
    expect(plain).toContain('_____');
    expect(plain).toContain('o');
  });

  it('picks deterministic greetings from seed', () => {
    expect(pickSparkGreeting(0)).toBe(pickSparkGreeting(0));
    expect(pickSparkGreeting(1)).not.toBe(pickSparkGreeting(0));
  });

  it('respects SPARK_CLI_NO_MASCOT', () => {
    const prev = process.env.SPARK_CLI_NO_MASCOT;
    process.env.SPARK_CLI_NO_MASCOT = '1';
    expect(isMascotDisabled()).toBe(true);
    process.env.SPARK_CLI_NO_MASCOT = prev;
  });
});
