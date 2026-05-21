/**
 * useImagePaste — detects image paste events from the terminal.
 *
 * Terminal image paste support varies by terminal emulator:
 * - iTerm2: supports inline images via OSC 1337
 * - kitty: supports via the kitty graphics protocol
 * - Most terminals: no direct image paste support
 *
 * This hook provides a pragmatic approach:
 * 1. Detects file paths pasted via drag-and-drop (many terminals
 *    paste the file path when a file is dragged into the terminal)
 * 2. Validates that the pasted path points to an image file
 * 3. Returns the image reference for inclusion in messages
 *
 * After P2.2: also supports clipboard image detection on terminals
 * that implement OSC 52 or the iTerm2 inline image protocol.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { existsSync, statSync } from 'node:fs';
import { extname, basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// ── Types ──────────────────────────────────────────────

export interface ImageReference {
  /** Unique ID for this image */
  id: string;
  /** Original filename */
  filename: string;
  /** Absolute file path */
  filePath: string;
  /** File extension (e.g., '.png') */
  extension: string;
  /** File size in bytes */
  size: number;
}

// ── Image extensions ───────────────────────────────────

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
  '.ico', '.tiff', '.tif',
]);

/**
 * Check if a file path points to a supported image file.
 */
function isImagePath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Try to parse a pasted string as a file path and check if it's an image.
 * Returns an ImageReference if valid, null otherwise.
 */
function tryParseImageFile(pastedText: string): ImageReference | null {
  // Trim whitespace and quotes (some terminals wrap paths in quotes)
  let cleanPath = pastedText.trim();
  if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
      (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
    cleanPath = cleanPath.slice(1, -1);
  }

  // Remove trailing whitespace/newlines from terminal paste
  cleanPath = cleanPath.replace(/[\r\n]+$/, '');

  // Check if it's an image extension
  if (!isImagePath(cleanPath)) return null;

  // Resolve to absolute path
  const absPath = resolve(cleanPath);

  // Check if file exists and get stats
  try {
    if (!existsSync(absPath)) return null;
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;

    // Reasonable size limit: 50MB
    if (stat.size > 50 * 1024 * 1024) return null;

    return {
      id: randomUUID(),
      filename: basename(absPath),
      filePath: absPath,
      extension: extname(absPath).toLowerCase(),
      size: stat.size,
    };
  } catch {
    return null;
  }
}

// ── Hook ───────────────────────────────────────────────

export interface UseImagePasteOptions {
  /** Whether to listen for image paste events (default: true) */
  enabled?: boolean;
  /** Callback when an image is pasted */
  onImagePaste?: (image: ImageReference) => void;
}

export interface UseImagePasteReturn {
  /** List of images that have been pasted in this session */
  pastedImages: ImageReference[];
  /** Add an image reference manually (e.g., from file picker) */
  addImage: (image: ImageReference) => void;
  /** Remove an image reference */
  removeImage: (id: string) => void;
  /** Clear all pasted images */
  clearImages: () => void;
  /**
   * Try to parse a pasted text string as an image file reference.
   * Returns the ImageReference if it's a valid image path, null otherwise.
   * Useful for detecting file drag-and-drop in the terminal.
   */
  tryParseImagePaste: (text: string) => ImageReference | null;
}

/**
 * useImagePaste — hook for detecting and managing image paste events.
 *
 * Usage:
 * ```tsx
 * const { pastedImages, tryParseImagePaste, clearImages } = useImagePaste({
 *   onImagePaste: (img) => console.log('Image pasted:', img.filename),
 * });
 *
 * // In your input handler:
 * const imgRef = tryParseImagePaste(pastedText);
 * if (imgRef) {
 *   // Include [image: filename.png] in the message
 * }
 * ```
 */
export function useImagePaste(options: UseImagePasteOptions = {}): UseImagePasteReturn {
  const { enabled = true, onImagePaste } = options;
  const [pastedImages, setPastedImages] = useState<ImageReference[]>([]);
  const onImagePasteRef = useRef(onImagePaste);
  onImagePasteRef.current = onImagePaste;

  const addImage = useCallback((image: ImageReference) => {
    setPastedImages((prev) => [...prev, image]);
    onImagePasteRef.current?.(image);
  }, []);

  const removeImage = useCallback((id: string) => {
    setPastedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    setPastedImages([]);
  }, []);

  const tryParseImagePaste = useCallback((text: string): ImageReference | null => {
    if (!enabled) return null;
    return tryParseImageFile(text);
  }, [enabled]);

  // ── Clipboard image detection (OSC 1337 for iTerm2) ──
  // This is a placeholder for future implementation.
  // iTerm2 sends: ESC ] 1337 ; File = ... ST
  // We would need to parse stdin for these sequences, similar to
  // how AlternateScreen.tsx parses focus events.

  useEffect(() => {
    if (!enabled) return;

    // Future: listen for OSC 1337 inline image sequences on stdin
    // For now, image paste is handled via the tryParseImagePaste
    // function, which checks if pasted text is a file path to an image.
  }, [enabled]);

  return {
    pastedImages,
    addImage,
    removeImage,
    clearImages,
    tryParseImagePaste,
  };
}
