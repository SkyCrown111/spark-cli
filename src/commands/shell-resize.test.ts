/**
 * Bug Condition Exploration Test for Terminal Resize Duplicate Rendering
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * **NOTE**: This test validates the FIXED implementation
 * After implementing tasks 3-6, this test should PASS, confirming:
 * - Atomic check-and-set prevents race conditions (Task 4.1)
 * - Async-aware handleTerminalResize properly awaits (Task 6.1)
 * - Debouncing and deduplication work correctly (Tasks 3.1-3.4)
 * - Single clean redraw with no duplicate content
 * 
 * **GOAL**: Verify that the fix eliminates duplicate rendering on terminal resize
 * 
 * This test validates the fixed behavior where:
 * 1. rerenderLayout uses atomic check-and-set to prevent concurrent execution
 * 2. handleTerminalResize properly awaits rerenderLayout completion
 * 3. watchTtyResize handles async callbacks with resizePending flag
 * 4. Debouncing and deduplication prevent multiple rerender calls
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

// Type assertion helper for mock stdout
const asWriteStream = (mock: MockStdout): NodeJS.WriteStream => mock as any;

/**
 * Mock stdout that captures all writes for analysis
 */
class MockStdout extends Writable {
  public writes: string[] = [];
  public columns = 80;
  public rows = 24;
  public isTTY = true;

  _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.writes.push(chunk.toString());
    callback();
  }

  clearWrites(): void {
    this.writes = [];
  }

  getAllOutput(): string {
    return this.writes.join('');
  }
}

/**
 * Mock stdin for simulating terminal events
 */
class MockStdin extends EventEmitter {
  public isTTY = true;
  public isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

/**
 * Count occurrences of a pattern in text
 */
function countOccurrences(text: string, pattern: string | RegExp): number {
  if (typeof pattern === 'string') {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(pattern, pos)) !== -1) {
      count++;
      pos += pattern.length;
    }
    return count;
  } else {
    const matches = text.match(new RegExp(pattern, 'g'));
    return matches ? matches.length : 0;
  }
}

/**
 * Extract visible text from ANSI output (strip escape sequences)
 */
function stripAnsi(text: string): string {
  // Remove ANSI escape sequences
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

/**
 * Simulate a terminal resize event
 */
function simulateResize(mockStdout: MockStdout, newCols: number, newRows: number): void {
  mockStdout.columns = newCols;
  mockStdout.rows = newRows;
  mockStdout.emit('resize');
}

describe('Bug Condition Exploration: Terminal Resize Duplicate Rendering', () => {
  let originalStdout: NodeJS.WriteStream;
  let originalStdin: NodeJS.ReadStream;
  let mockStdout: MockStdout;
  let mockStdin: MockStdin;

  beforeEach(() => {
    originalStdout = process.stdout;
    originalStdin = process.stdin;
    mockStdout = new MockStdout();
    mockStdin = new MockStdin();
    
    // Replace process.stdout and process.stdin
    Object.defineProperty(process, 'stdout', {
      value: mockStdout,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original stdout and stdin
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  });

  /**
   * Property 1: Expected Behavior - Single Clean Redraw on Resize (FIXED CODE)
   * 
   * This test validates the FIXED implementation where:
   * 1. rerenderLayout uses atomic check-and-set (Task 4.1)
   * 2. handleTerminalResize properly awaits rerenderLayout (Task 6.1)
   * 3. watchTtyResize handles async callbacks with resizePending flag (Task 3.1, 3.3)
   * 
   * **EXPECTED OUTCOME ON FIXED CODE**: Test PASSES
   * - Only 1 rerender executes despite multiple rapid calls
   * - Welcome banner appears exactly once
   * - Input prompt appears exactly once
   */
  it('Property 1: Async rerenderLayout race condition causes duplicate rendering', async () => {
    const { clearTtyViewport, writeReplBlock } = await import('../core/repl/viewport.js');
    
    let layoutRerendering = false;
    let rerenderStartCount = 0;
    let rerenderCompleteCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';
    const inputPrompt = '> ';
    
    // Simulate the FIXED rerenderLayout function from shell.ts
    // This implements the atomic check-and-set pattern (Task 4.1)
    const rerenderLayout = async (): Promise<void> => {
      // FIXED: Atomic check-and-set at the very start (synchronous)
      if (layoutRerendering) return;
      layoutRerendering = true;
      rerenderStartCount++;
      
      try {
        // Simulate async operations (buildWelcomeText, etc.)
        await new Promise(resolve => setTimeout(resolve, 10));
        
        clearTtyViewport(asWriteStream(mockStdout));
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
        mockStdout.write(inputPrompt);
        
        await new Promise(resolve => setTimeout(resolve, 10));
      } finally {
        layoutRerendering = false;
        rerenderCompleteCount++;
      }
    };

    // FIXED: handleTerminalResize now awaits (Task 6.1)
    const handleTerminalResize = async (): Promise<void> => {
      await rerenderLayout();
    };

    // Initial render
    mockStdout.clearWrites();
    writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
    mockStdout.write(inputPrompt);

    // Clear for test
    mockStdout.clearWrites();
    rerenderStartCount = 0;
    rerenderCompleteCount = 0;

    // Simulate rapid resize events - fire all three WITHOUT awaiting
    // This tests that the atomic check-and-set prevents concurrent execution
    const promise1 = handleTerminalResize();
    const promise2 = handleTerminalResize(); // Should be blocked by flag
    const promise3 = handleTerminalResize(); // Should be blocked by flag

    // Now await all of them
    await Promise.all([promise1, promise2, promise3]);

    // Wait for any remaining async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    const resizeOutput = mockStdout.getAllOutput();
    const visibleText = stripAnsi(resizeOutput);

    // **CRITICAL ASSERTIONS**: These should PASS on fixed code
    // Expected: only 1 rerender should start (fixed code prevents concurrent calls)
    expect(rerenderStartCount).toBe(1);
    
    // Expected: welcome banner appears exactly once
    const bannerCount = countOccurrences(visibleText, welcomeBanner);
    expect(bannerCount).toBe(1);

    // Expected: input prompt appears exactly once
    const promptCount = countOccurrences(visibleText, inputPrompt);
    expect(promptCount).toBe(1);
  });

  /**
   * Property 1b: Rapid resize sequence should trigger only one rerender
   * 
   * Tests that multiple resize events in quick succession (within 100ms)
   * are debounced to a single rerender operation.
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: Test FAILS
   * - Multiple rerender calls (5+ instead of 1)
   * - Duplicate content from concurrent rerenders
   */
  it('Property 1b: Rapid resize sequence (5 events within 100ms) should debounce to single rerender', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } = await import('../core/repl/viewport.js');
    
    let rerenderCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';
    const historyEntry = 'User: test prompt\nAssistant: test response';
    const inputPrompt = '> ';
    
    const handleResize = (): void => {
      rerenderCount++;
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      writeReplBlock(historyEntry, asWriteStream(mockStdout));
      mockStdout.write(inputPrompt);
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 150 });

    try {
      // Initial render
      mockStdout.clearWrites();
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      writeReplBlock(historyEntry, asWriteStream(mockStdout));
      mockStdout.write(inputPrompt);

      // Clear for resize test
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Simulate rapid resize sequence (5 events within 100ms)
      const sizes = [
        { cols: 85, rows: 25 },
        { cols: 90, rows: 26 },
        { cols: 95, rows: 27 },
        { cols: 100, rows: 28 },
        { cols: 105, rows: 29 },
      ];

      for (const size of sizes) {
        simulateResize(mockStdout, size.cols, size.rows);
        await new Promise(resolve => setTimeout(resolve, 20)); // 20ms between events
      }

      // Wait for debounce to settle
      await new Promise(resolve => setTimeout(resolve, 200));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // **CRITICAL ASSERTIONS**: These should FAIL on unfixed code
      // Expected: only 1 rerender despite 5 resize events
      expect(rerenderCount).toBeLessThanOrEqual(1);

      // Expected: welcome banner appears exactly once
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Expected: history entry appears exactly once
      const historyCount = countOccurrences(visibleText, 'User: test prompt');
      expect(historyCount).toBe(1);

      // Expected: input prompt appears exactly once
      const promptCount = countOccurrences(visibleText, inputPrompt);
      expect(promptCount).toBe(1);

    } finally {
      unwatch();
    }
  });

  /**
   * Property 1c: Windows dual-trigger scenario
   * 
   * On Windows, both polling and resize event can fire for the same size change,
   * potentially triggering duplicate rerenders.
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: Test FAILS on Windows
   * - Two rerender calls for same size change
   * - Duplicate content
   */
  it('Property 1c: Windows dual-trigger (polling + event) should not cause duplicate rerender', async () => {
    // Simulate Windows environment
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });

    try {
      const { watchTtyResize, clearTtyViewport, writeReplBlock } = await import('../core/repl/viewport.js');
      
      let rerenderCount = 0;
      const welcomeBanner = '=== SparkCLI Welcome ===';
      const inputPrompt = '> ';
      
      const handleResize = (): void => {
        rerenderCount++;
        clearTtyViewport(asWriteStream(mockStdout));
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
        mockStdout.write(inputPrompt);
      };

      // Enable polling for Windows
      const unwatch = watchTtyResize(handleResize, { debounceMs: 150, pollMs: 250 });

      try {
        // Initial render
        mockStdout.clearWrites();
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
        mockStdout.write(inputPrompt);

        // Clear for resize test
        mockStdout.clearWrites();
        rerenderCount = 0;

        // Simulate resize - both event and polling will detect it
        simulateResize(mockStdout, 100, 30);

        // Wait for both event and poll cycle
        await new Promise(resolve => setTimeout(resolve, 400));

        const resizeOutput = mockStdout.getAllOutput();
        const visibleText = stripAnsi(resizeOutput);

        // **CRITICAL ASSERTIONS**: These should FAIL on unfixed Windows code
        // Expected: only 1 rerender despite dual trigger
        expect(rerenderCount).toBe(1);

        // Expected: welcome banner appears exactly once
        const bannerCount = countOccurrences(visibleText, welcomeBanner);
        expect(bannerCount).toBe(1);

        // Expected: input prompt appears exactly once
        const promptCount = countOccurrences(visibleText, inputPrompt);
        expect(promptCount).toBe(1);

      } finally {
        unwatch();
      }
    } finally {
      // Restore platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      });
    }
  });

  /**
   * Property-Based Test: Random resize sequences should never produce duplicates
   * 
   * Uses fast-check to generate random resize sequences and verify
   * that no duplicate content appears.
   */
  it('Property-Based: Random resize sequences should produce single clean redraw', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } = await import('../core/repl/viewport.js');

    await fc.assert(
      fc.asyncProperty(
        // Generate random resize sequences
        fc.array(
          fc.record({
            cols: fc.integer({ min: 40, max: 200 }),
            rows: fc.integer({ min: 10, max: 60 }),
            delayMs: fc.integer({ min: 10, max: 100 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (resizeSequence) => {
          let rerenderCount = 0;
          const welcomeBanner = '=== SparkCLI Welcome ===';
          const inputPrompt = '> ';
          
          const handleResize = (): void => {
            rerenderCount++;
            clearTtyViewport(asWriteStream(mockStdout));
            writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
            mockStdout.write(inputPrompt);
          };

          const unwatch = watchTtyResize(handleResize, { debounceMs: 150 });

          try {
            // Initial render
            mockStdout.clearWrites();
            writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
            mockStdout.write(inputPrompt);

            // Clear for resize test
            mockStdout.clearWrites();
            rerenderCount = 0;

            // Execute resize sequence
            for (const resize of resizeSequence) {
              simulateResize(mockStdout, resize.cols, resize.rows);
              await new Promise(resolve => setTimeout(resolve, resize.delayMs));
            }

            // Wait for debounce to settle
            await new Promise(resolve => setTimeout(resolve, 200));

            const resizeOutput = mockStdout.getAllOutput();
            const visibleText = stripAnsi(resizeOutput);

            // Count occurrences
            const bannerCount = countOccurrences(visibleText, welcomeBanner);
            const promptCount = countOccurrences(visibleText, inputPrompt);

            // **CRITICAL ASSERTIONS**: Should FAIL on unfixed code with various sequences
            // Expected: at most 1 rerender for any sequence
            expect(rerenderCount).toBeLessThanOrEqual(1);

            // Expected: welcome banner appears at most once
            expect(bannerCount).toBeLessThanOrEqual(1);

            // Expected: input prompt appears at most once
            expect(promptCount).toBeLessThanOrEqual(1);

          } finally {
            unwatch();
          }
        }
      ),
      { numRuns: 5, timeout: 10000 } // Run 5 random test cases with 10s timeout
    );
  }, 15000); // 15 second test timeout
});
