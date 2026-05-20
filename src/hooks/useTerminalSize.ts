/**
 * useTerminalSize hook - Terminal size monitoring
 * Tracks terminal dimensions and updates on resize events
 */

import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

export interface TerminalSize {
  /** Terminal width in columns */
  width: number;
  /** Terminal height in rows */
  height: number;
}

/**
 * Hook to monitor terminal size changes
 * 
 * Returns the current terminal dimensions and automatically updates
 * when the terminal is resized.
 * 
 * @returns Current terminal size (width and height)
 * 
 * @example
 * ```tsx
 * const { width, height } = useTerminalSize();
 * 
 * return (
 *   <Box width={width} height={height}>
 *     <Text>Terminal is {width}x{height}</Text>
 *   </Box>
 * );
 * ```
 */
export const useTerminalSize = (): TerminalSize => {
  const { stdout } = useStdout();
  
  const getSize = (): TerminalSize => ({
    width: stdout.columns || 80,
    height: stdout.rows || 24,
  });

  const [size, setSize] = useState<TerminalSize>(getSize());

  useEffect(() => {
    const handleResize = () => {
      setSize(getSize());
    };

    // Listen for resize events
    stdout.on('resize', handleResize);

    // Cleanup listener on unmount
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return size;
};
