/**
 * MarkdownRenderer component - Async wrapper for ink-markdown
 * Handles the top-level await issue in ink-markdown
 */

import React, { useState, useEffect } from 'react';
import { Text } from '../design-system/Text.js';

interface MarkdownRendererProps {
  children: string;
}

// Cache for the loaded Markdown component
let MarkdownComponent: React.ComponentType<{ children: string }> | null = null;
let loadingPromise: Promise<void> | null = null;

/**
 * Load the ink-markdown component asynchronously
 */
function loadMarkdown(): Promise<void> {
  if (loadingPromise) {
    return loadingPromise;
  }
  
  loadingPromise = import('ink-markdown')
    .then((module) => {
      MarkdownComponent = module.default;
    })
    .catch((error) => {
      console.error('Failed to load ink-markdown:', error);
      // Fallback to plain text
      MarkdownComponent = ({ children }: { children: string }) => <Text>{children}</Text>;
    });
  
  return loadingPromise;
}

/**
 * MarkdownRenderer component
 * Renders markdown content with fallback to plain text
 * 
 * @example
 * ```tsx
 * <MarkdownRenderer>**Bold** and *italic* text</MarkdownRenderer>
 * ```
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState(MarkdownComponent !== null);
  
  useEffect(() => {
    if (!MarkdownComponent) {
      loadMarkdown().then(() => {
        setIsLoaded(true);
      });
    }
  }, []);
  
  // While loading or if markdown failed to load, show plain text
  if (!isLoaded || !MarkdownComponent) {
    return <Text>{children}</Text>;
  }
  
  // Render with markdown
  const Markdown = MarkdownComponent;
  return <Markdown>{children}</Markdown>;
};
