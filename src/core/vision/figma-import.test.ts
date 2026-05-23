import { describe, expect, it } from 'vitest';
import { parseFigmaUrl } from './figma-import.js';

describe('figma-import', () => {
  it('parses design URL with node-id', () => {
    const parts = parseFigmaUrl('https://www.figma.com/design/AbCdEf12/My-File?node-id=1-234');
    expect(parts.fileKey).toBe('AbCdEf12');
    expect(parts.nodeId).toBe('1:234');
  });

  it('parses legacy file URL', () => {
    const parts = parseFigmaUrl('https://www.figma.com/file/XyZ99/Legacy');
    expect(parts.fileKey).toBe('XyZ99');
  });
});
