/**
 * Collapse tool results — automatically folds long tool
 * outputs into a compact "▶ N lines collapsed" display.
 *
 * When a tool message exceeds a threshold number of lines,
 * it's collapsed to show only the first few and last few lines,
 * with a summary of how many lines are hidden.
 */

export interface CollapseResult {
  /** Whether the content was collapsed */
  collapsed: boolean;
  /** Visible lines (first + last if collapsed, all if not) */
  visibleLines: string[];
  /** Number of hidden lines */
  hiddenCount: number;
  /** Total line count */
  totalCount: number;
}

const DEFAULT_MAX_VISIBLE = 6;
const DEFAULT_COLLAPSE_THRESHOLD = 15;

/**
 * Collapse a multi-line content string if it exceeds the threshold.
 *
 * @param content - The full text content
 * @param threshold - Number of lines before collapsing (default: 15)
 * @param maxVisible - Lines to show when collapsed (default: 6)
 */
export function collapseToolResult(
  content: string,
  threshold = DEFAULT_COLLAPSE_THRESHOLD,
  maxVisible = DEFAULT_MAX_VISIBLE,
): CollapseResult {
  const lines = content.split('\n');
  const totalCount = lines.length;

  if (totalCount <= threshold) {
    return {
      collapsed: false,
      visibleLines: lines,
      hiddenCount: 0,
      totalCount,
    };
  }

  // Show first 3 lines and last 3 lines
  const headLines = Math.ceil(maxVisible / 2);
  const tailLines = Math.floor(maxVisible / 2);

  const visibleLines = [
    ...lines.slice(0, headLines),
    `  ▶ ${totalCount - headLines - tailLines} lines collapsed`,
    ...lines.slice(totalCount - tailLines),
  ];

  return {
    collapsed: true,
    visibleLines,
    hiddenCount: totalCount - headLines - tailLines,
    totalCount,
  };
}

/**
 * Collapse background bash output — folds long running
 * background command notifications.
 */
export function collapseBackgroundBash(
  content: string,
  maxLines = 8,
): CollapseResult {
  const lines = content.split('\n');
  const totalCount = lines.length;

  if (totalCount <= maxLines) {
    return {
      collapsed: false,
      visibleLines: lines,
      hiddenCount: 0,
      totalCount,
    };
  }

  return {
    collapsed: true,
    visibleLines: lines.slice(0, maxLines),
    hiddenCount: totalCount - maxLines,
    totalCount,
  };
}