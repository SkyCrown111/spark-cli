/**
 * Squash adjacent Text nodes into a single string to reduce
 * the number of terminal writes per render frame.
 *
 * When multiple <Text> elements are rendered consecutively with
 * the same style, they can be merged into a single write operation,
 * reducing output overhead.
 */

export interface SquashableTextNode {
  text: string;
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Attempt to squash adjacent text nodes with matching styles.
 * Returns the merged list — nodes with identical styles are combined.
 */
export function squashTextNodes(
  nodes: SquashableTextNode[],
): SquashableTextNode[] {
  if (nodes.length === 0) return [];

  const result: SquashableTextNode[] = [{ ...nodes[0] }];

  for (let i = 1; i < nodes.length; i++) {
    const current = nodes[i];
    const last = result[result.length - 1];

    // Merge if all style props match
    if (
      last.color === current.color &&
      last.dimColor === current.dimColor &&
      last.bold === current.bold &&
      last.italic === current.italic
    ) {
      last.text += current.text;
    } else {
      result.push({ ...current });
    }
  }

  return result;
}