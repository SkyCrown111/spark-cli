/**
 * CSI (Control Sequence Introducer) sequence generator.
 *
 * CSI sequences use the format ESC [ <params> <final-byte>.
 * Used for cursor movement, scrolling, and mode switching.
 */

/**
 * Generate a CSI sequence with the given parameters and final byte.
 * Format: ESC [ <params> <final>
 */
export function csi(params: string, final: string = ''): string {
  return `\x1b[${params}${final}`;
}
