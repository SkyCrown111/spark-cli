/**
 * UserImageMessage — renders an image reference in the message list.
 *
 * Displays a compact inline representation of a pasted image,
 * showing the filename, size, and a visual indicator.
 *
 * In terminals that support the iTerm2 inline image protocol
 * (OSC 1337), this could render the actual image inline.
 * For all other terminals, it shows a styled file reference.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ImageReference } from '../../hooks/useImagePaste.js';

// ── Props ──────────────────────────────────────────────

export interface UserImageMessageProps {
  /** The image reference to display */
  image: ImageReference;
}

// ── Helpers ────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Component ──────────────────────────────────────────

/**
 * UserImageMessage — displays a pasted image reference.
 *
 * Shows:
 * - 🖼️ icon
 * - Filename
 * - File size
 * - File path (dimmed)
 */
export const UserImageMessage: React.FC<UserImageMessageProps> = ({ image }) => {
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Text color="cyan">{'>'}</Text>
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="cyan" bold>
            {image.filename}
          </Text>
          <Text dimColor>({formatFileSize(image.size)})</Text>
        </Box>
        <Text dimColor>{image.filePath}</Text>
      </Box>
    </Box>
  );
};
