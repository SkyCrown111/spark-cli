/**
 * ErrorBoundary component - React error boundary for Ink components
 * Catches rendering errors and displays a fallback UI instead of crashing.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box } from '../design-system/Box.js';
import { Text } from '../design-system/Text.js';
import { writeErrorLog } from './ErrorLogger.js';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback component to render when an error occurs */
  fallback?: ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log error to file
    writeErrorLog(error, info);

    // Call optional callback
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const message = this.state.error?.message ?? 'Unknown error';

      return (
        <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
          <Text bold color="red">✗ Component Error</Text>
          <Text color="red">{message}</Text>
          <Box marginTop={1}>
            <Text dimColor>The component crashed. Press Ctrl+L to clear and try again.</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}