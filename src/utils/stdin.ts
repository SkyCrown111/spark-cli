/**
 * Helpers for non-interactive (print/pipe) output.
 */

/**
 * Read all data from stdin when it is not a TTY (pipe input).
 * Returns the concatenated string, or empty string if stdin is a TTY.
 */
export async function readStdinPipe(): Promise<string> {
  if (process.stdin.isTTY) return '';

  const chunks: Buffer[] = [];
  return new Promise<string>((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}
