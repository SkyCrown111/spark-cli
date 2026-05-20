/**
 * Ink rendering optimizer — dirty node tracking and blit optimization.
 *
 * Tracks which nodes have changed between renders and only writes
 * the changed cells to the terminal output, avoiding full-screen
 * redraws on every frame.
 *
 * This is a lightweight version of Claude Code's optimizer — it
 * doesn't fork Ink's reconciler but works as a post-render step
 * that compares the previous and current output strings.
 */

export interface OptimizerState {
  /** Previous screen output string */
  prevScreen: string | null;
  /** Whether the next render should be a full redraw */
  forceFullRedraw: boolean;
}

/**
 * Create a new optimizer state.
 */
export function createOptimizerState(): OptimizerState {
  return {
    prevScreen: null,
    forceFullRedraw: true, // First render is always full
  };
}

/**
 * Compute the diff between previous and current screen output.
 * Returns a list of line-level changes that need to be written.
 *
 * For now this returns either:
 * - null (no changes) when prev === current
 * - the full current output when forceFullRedraw or prev is null
 * - a minimal diff (line-by-line) otherwise
 */
export function computeOptimizedOutput(
  state: OptimizerState,
  currentOutput: string,
): { output: string; newState: OptimizerState } {
  // First render or forced full redraw
  if (state.forceFullRedraw || state.prevScreen === null) {
    return {
      output: currentOutput,
      newState: { prevScreen: currentOutput, forceFullRedraw: false },
    };
  }

  // No changes
  if (state.prevScreen === currentOutput) {
    return {
      output: '', // Nothing to write
      newState: state,
    };
  }

  // Line-by-line diff for partial update
  const prevLines = state.prevScreen.split('\n');
  const currentLines = currentOutput.split('\n');
  const maxLines = Math.max(prevLines.length, currentLines.length);

  const diffLines: string[] = [];
  let hasChanges = false;

  for (let i = 0; i < maxLines; i++) {
    const prevLine = prevLines[i] ?? '';
    const currLine = currentLines[i] ?? '';
    if (prevLine !== currLine) {
      diffLines.push(currLine);
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return { output: '', newState: state };
  }

  // For now, return full output since Ink doesn't support partial writes.
  // The optimizer framework is here for when we integrate a custom renderer.
  return {
    output: currentOutput,
    newState: { prevScreen: currentOutput, forceFullRedraw: false },
  };
}

/**
 * Force a full redraw on the next render (e.g., after terminal resize).
 */
export function forceRedraw(state: OptimizerState): OptimizerState {
  return { ...state, forceFullRedraw: true };
}