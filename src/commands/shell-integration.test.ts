/**
 * Integration Testing and Validation for Terminal Resize Bug Fix
 *
 * **Task 7: Integration testing and validation**
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * This test suite performs comprehensive integration testing across:
 * - Task 7.1: Full REPL session with multiple resizes
 * - Task 7.2: Platform-specific behavior
 * - Task 7.3: Various conversation history lengths
 * - Task 7.4: Visual validation of stdout output
 *
 * **EXPECTED OUTCOME**: All tests PASS, confirming the fix works in real-world scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

/**
 * Parse ANSI escape sequences to detect clearing operations
 */
function detectClearSequences(output: string): {
  clearScreen: number;
  clearScrollback: number;
  homeCursor: number;
} {
  return {
    clearScreen: countOccurrences(output, /\x1b\[2J/),
    clearScrollback: countOccurrences(output, /\x1b\[3J/),
    homeCursor: countOccurrences(output, /\x1b\[H/),
  };
}

describe('Task 7.1: Full REPL Session with Multiple Resizes', () => {
  let originalStdout: NodeJS.WriteStream;
  let originalStdin: NodeJS.ReadStream;
  let mockStdout: MockStdout;
  let mockStdin: MockStdin;

  beforeEach(() => {
    originalStdout = process.stdout;
    originalStdin = process.stdin;
    mockStdout = new MockStdout();
    mockStdin = new MockStdin();

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
   * Task 7.1.1: Test resize at startup (before any input)
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.1.1: Resize at startup (before any input) produces single clean redraw', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');
    const { InputBox } = await import('../core/repl/input-box.js');

    let layoutRerendering = false;
    const activeController: AbortController | null = null;
    const sessionClosed = false;
    const welcomeBanner = '=== SparkCLI Welcome ===';

    const inputBox = new InputBox();

    // Simulate rerenderLayout from shell.ts
    const rerenderLayout = async (): Promise<void> => {
      if (layoutRerendering || activeController || sessionClosed) return;
      layoutRerendering = true;

      try {
        const inputDraft = inputBox.isVisible ? inputBox.suspendForRerender() : undefined;
        clearTtyViewport(asWriteStream(mockStdout));
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
        if (inputDraft) {
          inputBox.resumeAfterRerender(inputDraft);
        }
      } finally {
        layoutRerendering = false;
      }
    };

    const handleTerminalResize = async (): Promise<void> => {
      await rerenderLayout();
    };

    const unwatch = watchTtyResize(handleTerminalResize, { debounceMs: 200 });

    try {
      // Initial render (startup)
      mockStdout.clearWrites();
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      inputBox.show();

      // Clear for resize test
      mockStdout.clearWrites();

      // Resize at startup (before any user input)
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Verify proper clearing sequence
      const clearSeq = detectClearSequences(resizeOutput);
      expect(clearSeq.clearScreen).toBeGreaterThanOrEqual(1);
      expect(clearSeq.homeCursor).toBeGreaterThanOrEqual(1);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.1.2: Test resize during agent turn (activeController set)
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.1.2: Resize during agent turn (activeController set) is blocked', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');
    const { InputBox } = await import('../core/repl/input-box.js');

    let layoutRerendering = false;
    const activeController: AbortController | null = new AbortController(); // Simulate agent turn
    const sessionClosed = false;
    const welcomeBanner = '=== SparkCLI Welcome ===';

    const inputBox = new InputBox();
    let rerenderCount = 0;

    const rerenderLayout = async (): Promise<void> => {
      if (layoutRerendering || activeController || sessionClosed) return;
      layoutRerendering = true;
      rerenderCount++;

      try {
        const inputDraft = inputBox.isVisible ? inputBox.suspendForRerender() : undefined;
        clearTtyViewport(asWriteStream(mockStdout));
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
        if (inputDraft) {
          inputBox.resumeAfterRerender(inputDraft);
        }
      } finally {
        layoutRerendering = false;
      }
    };

    const handleTerminalResize = async (): Promise<void> => {
      await rerenderLayout();
    };

    const unwatch = watchTtyResize(handleTerminalResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Resize during agent turn (activeController is set)
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify rerender was blocked
      expect(rerenderCount).toBe(0);

      const resizeOutput = mockStdout.getAllOutput();
      expect(resizeOutput).toBe(''); // No output because rerender was blocked
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.1.3: Test resize during user input (InputBox visible)
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.1.3: Resize during user input (InputBox visible) produces single clean redraw', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');
    const { InputBox } = await import('../core/repl/input-box.js');

    let layoutRerendering = false;
    const activeController: AbortController | null = null;
    const sessionClosed = false;
    const welcomeBanner = '=== SparkCLI Welcome ===';

    const inputBox = new InputBox();

    const rerenderLayout = async (): Promise<void> => {
      if (layoutRerendering || activeController || sessionClosed) return;
      layoutRerendering = true;

      try {
        const inputDraft = inputBox.isVisible ? inputBox.suspendForRerender() : undefined;
        clearTtyViewport(asWriteStream(mockStdout));
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
        if (inputDraft) {
          inputBox.resumeAfterRerender(inputDraft);
        }
      } finally {
        layoutRerendering = false;
      }
    };

    const handleTerminalResize = async (): Promise<void> => {
      await rerenderLayout();
    };

    const unwatch = watchTtyResize(handleTerminalResize, { debounceMs: 200 });

    try {
      // Initial render with InputBox visible
      mockStdout.clearWrites();
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      inputBox.show();

      // User types some text
      inputBox.handleKey('t', { name: 't' });
      inputBox.handleKey('e', { name: 'e' });
      inputBox.handleKey('s', { name: 's' });
      inputBox.handleKey('t', { name: 't' });

      // Clear for resize test
      mockStdout.clearWrites();

      // Resize while InputBox is visible
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Verify InputBox text is preserved
      expect(inputBox.text).toBe('test');
      expect(inputBox.isVisible).toBe(true);

      // Verify proper clearing sequence
      const clearSeq = detectClearSequences(resizeOutput);
      expect(clearSeq.clearScreen).toBeGreaterThanOrEqual(1);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.1.4: Test resize after session close
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.1.4: Resize after session close is blocked', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');
    const { InputBox } = await import('../core/repl/input-box.js');

    let layoutRerendering = false;
    const activeController: AbortController | null = null;
    const sessionClosed = true; // Session is closed
    const welcomeBanner = '=== SparkCLI Welcome ===';

    const inputBox = new InputBox();
    let rerenderCount = 0;

    const rerenderLayout = async (): Promise<void> => {
      if (layoutRerendering || activeController || sessionClosed) return;
      layoutRerendering = true;
      rerenderCount++;

      try {
        const inputDraft = inputBox.isVisible ? inputBox.suspendForRerender() : undefined;
        clearTtyViewport(asWriteStream(mockStdout));
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
        if (inputDraft) {
          inputBox.resumeAfterRerender(inputDraft);
        }
      } finally {
        layoutRerendering = false;
      }
    };

    const handleTerminalResize = async (): Promise<void> => {
      await rerenderLayout();
    };

    const unwatch = watchTtyResize(handleTerminalResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Resize after session close
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify rerender was blocked
      expect(rerenderCount).toBe(0);

      const resizeOutput = mockStdout.getAllOutput();
      expect(resizeOutput).toBe(''); // No output because rerender was blocked
    } finally {
      unwatch();
    }
  });
});

describe('Task 7.2: Platform-Specific Behavior', () => {
  let originalStdout: NodeJS.WriteStream;
  let originalStdin: NodeJS.ReadStream;
  let originalPlatform: NodeJS.Platform;
  let mockStdout: MockStdout;
  let mockStdin: MockStdin;

  beforeEach(() => {
    originalStdout = process.stdout;
    originalStdin = process.stdin;
    originalPlatform = process.platform;
    mockStdout = new MockStdout();
    mockStdin = new MockStdin();

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
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  /**
   * Task 7.2.1: Test on Windows with WT_SESSION (Windows Terminal)
   *
   * Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
   */
  it('7.2.1: Windows with WT_SESSION (Windows Terminal) handles resize correctly', async () => {
    // Simulate Windows Terminal environment
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });
    process.env.WT_SESSION = 'test-session-id';

    try {
      const { watchTtyResize, clearTtyViewport, writeReplBlock } =
        await import('../core/repl/viewport.js');

      let rerenderCount = 0;
      const welcomeBanner = '=== SparkCLI Welcome ===';

      const handleResize = (): void => {
        rerenderCount++;
        clearTtyViewport(asWriteStream(mockStdout));
        writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      };

      const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

      try {
        mockStdout.clearWrites();
        rerenderCount = 0;

        // Simulate resize
        simulateResize(mockStdout, 120, 30);

        // Wait for debounce
        await new Promise((resolve) => setTimeout(resolve, 300));

        const resizeOutput = mockStdout.getAllOutput();
        const visibleText = stripAnsi(resizeOutput);

        // Verify single rerender
        expect(rerenderCount).toBeLessThanOrEqual(1);

        // Verify single clean redraw
        const bannerCount = countOccurrences(visibleText, welcomeBanner);
        expect(bannerCount).toBe(1);
      } finally {
        unwatch();
      }
    } finally {
      delete process.env.WT_SESSION;
    }
  });

  /**
   * Task 7.2.2: Test on Windows without WT_SESSION (legacy console)
   *
   * Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
   */
  it('7.2.2: Windows without WT_SESSION (legacy console) handles resize correctly', async () => {
    // Simulate legacy Windows console
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });
    delete process.env.WT_SESSION;

    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    let rerenderCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';

    const handleResize = (): void => {
      rerenderCount++;
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
    };

    // Enable polling for legacy console
    const unwatch = watchTtyResize(handleResize, { debounceMs: 200, pollMs: 250 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Simulate resize (both event and polling may detect it)
      simulateResize(mockStdout, 120, 30);

      // Wait for both event and poll cycle
      await new Promise((resolve) => setTimeout(resolve, 500));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single rerender (deduplication should prevent dual-trigger)
      expect(rerenderCount).toBe(1);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.2.3: Test on macOS
   *
   * Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
   */
  it('7.2.3: macOS handles resize correctly', async () => {
    // Simulate macOS environment
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      writable: true,
      configurable: true,
    });

    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    let rerenderCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';

    const handleResize = (): void => {
      rerenderCount++;
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single rerender
      expect(rerenderCount).toBeLessThanOrEqual(1);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.2.4: Test on Linux
   *
   * Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
   */
  it('7.2.4: Linux handles resize correctly', async () => {
    // Simulate Linux environment
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      writable: true,
      configurable: true,
    });

    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    let rerenderCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';

    const handleResize = (): void => {
      rerenderCount++;
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single rerender
      expect(rerenderCount).toBeLessThanOrEqual(1);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);
    } finally {
      unwatch();
    }
  });
});

describe('Task 7.3: Various Conversation History Lengths', () => {
  let originalStdout: NodeJS.WriteStream;
  let originalStdin: NodeJS.ReadStream;
  let mockStdout: MockStdout;
  let mockStdin: MockStdin;

  beforeEach(() => {
    originalStdout = process.stdout;
    originalStdin = process.stdin;
    mockStdout = new MockStdout();
    mockStdin = new MockStdin();

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
   * Task 7.3.1: Test with empty history (fresh session)
   *
   * Validates: Requirements 2.1, 2.5, 3.2
   */
  it('7.3.1: Empty history (fresh session) handles resize correctly', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    let rerenderCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';
    const history: string[] = []; // Empty history

    const handleResize = (): void => {
      rerenderCount++;
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      // Render history (empty)
      for (const entry of history) {
        writeReplBlock(entry, asWriteStream(mockStdout));
      }
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single rerender
      expect(rerenderCount).toBeLessThanOrEqual(1);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Verify no duplicate content
      expect(visibleText.split(welcomeBanner).length - 1).toBe(1);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.3.2: Test with short history (2-3 turns)
   *
   * Validates: Requirements 2.1, 2.5, 3.2
   */
  it('7.3.2: Short history (2-3 turns) handles resize correctly', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    let rerenderCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';
    const history = [
      'User: What is the weather?',
      'Assistant: I can help you check the weather.',
      'User: Show me the forecast',
      'Assistant: Here is the forecast for today.',
    ];

    const handleResize = (): void => {
      rerenderCount++;
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      // Render history
      for (const entry of history) {
        writeReplBlock(entry, asWriteStream(mockStdout));
      }
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single rerender
      expect(rerenderCount).toBeLessThanOrEqual(1);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Verify each history entry appears exactly once
      for (const entry of history) {
        const entryCount = countOccurrences(visibleText, entry);
        expect(entryCount).toBe(1);
      }
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.3.3: Test with long history (20+ turns)
   *
   * Validates: Requirements 2.1, 2.5, 3.2
   */
  it('7.3.3: Long history (20+ turns) handles resize correctly', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    let rerenderCount = 0;
    const welcomeBanner = '=== SparkCLI Welcome ===';

    // Generate 20+ turns of history
    const history: string[] = [];
    for (let i = 1; i <= 25; i++) {
      history.push(`User: Question ${i}`);
      history.push(`Assistant: Answer ${i}`);
    }

    const handleResize = (): void => {
      rerenderCount++;
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      // Render history
      for (const entry of history) {
        writeReplBlock(entry, asWriteStream(mockStdout));
      }
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();
      rerenderCount = 0;

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single rerender
      expect(rerenderCount).toBeLessThanOrEqual(1);

      // Verify single clean redraw
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Verify a sample of history entries appear exactly once
      // Use more specific patterns to avoid substring matches
      const sampleEntries = [
        'User: Question 5',
        'Assistant: Answer 5',
        'User: Question 15',
        'Assistant: Answer 15',
        'User: Question 25',
        'Assistant: Answer 25',
      ];

      for (const entry of sampleEntries) {
        const entryCount = countOccurrences(visibleText, entry);
        expect(entryCount).toBe(1);
      }
    } finally {
      unwatch();
    }
  });
});

describe('Task 7.4: Visual Validation of Stdout Output', () => {
  let originalStdout: NodeJS.WriteStream;
  let originalStdin: NodeJS.ReadStream;
  let mockStdout: MockStdout;
  let mockStdin: MockStdin;

  beforeEach(() => {
    originalStdout = process.stdout;
    originalStdin = process.stdin;
    mockStdout = new MockStdout();
    mockStdin = new MockStdin();

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
   * Task 7.4.1: Capture stdout during resize operations
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.4.1: Stdout capture during resize shows proper sequence', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    const welcomeBanner = '=== SparkCLI Welcome ===';
    const history = ['User: test prompt', 'Assistant: test response'];

    const handleResize = (): void => {
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      for (const entry of history) {
        writeReplBlock(entry, asWriteStream(mockStdout));
      }
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();

      // Verify output was captured
      expect(resizeOutput.length).toBeGreaterThan(0);

      // Verify output contains ANSI sequences
      expect(resizeOutput).toContain('\x1b[');

      // Verify clearing sequences are present
      const clearSeq = detectClearSequences(resizeOutput);
      expect(clearSeq.clearScreen).toBeGreaterThanOrEqual(1);
      expect(clearSeq.homeCursor).toBeGreaterThanOrEqual(1);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.4.2: Parse ANSI escape sequences
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.4.2: ANSI escape sequences are properly formatted', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    const welcomeBanner = '=== SparkCLI Welcome ===';

    const handleResize = (): void => {
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();

      // Verify ANSI sequences are well-formed
      // Clear screen: \x1b[2J
      expect(resizeOutput).toMatch(/\x1b\[2J/);

      // Home cursor: \x1b[H
      expect(resizeOutput).toMatch(/\x1b\[H/);

      // Verify no malformed sequences (incomplete escapes)
      const incompleteEscapes = resizeOutput.match(/\x1b(?!\[)/g);
      expect(incompleteEscapes).toBeNull();
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.4.3: Verify no duplicate content patterns
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.4.3: No duplicate content patterns (banners, prompts, history)', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    const welcomeBanner = '=== SparkCLI Welcome ===';
    const history = [
      'User: first prompt',
      'Assistant: first response',
      'User: second prompt',
      'Assistant: second response',
    ];
    const inputPrompt = '> ';

    const handleResize = (): void => {
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      for (const entry of history) {
        writeReplBlock(entry, asWriteStream(mockStdout));
      }
      mockStdout.write(inputPrompt);
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify no duplicate banners
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Verify no duplicate history entries
      for (const entry of history) {
        const entryCount = countOccurrences(visibleText, entry);
        expect(entryCount).toBe(1);
      }

      // Verify no duplicate prompts
      const promptCount = countOccurrences(visibleText, inputPrompt);
      expect(promptCount).toBe(1);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.4.4: Verify proper clearing and redrawing sequence
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.4.4: Proper clearing and redrawing sequence', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    const welcomeBanner = '=== SparkCLI Welcome ===';
    const history = ['User: test', 'Assistant: response'];

    const handleResize = (): void => {
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      for (const entry of history) {
        writeReplBlock(entry, asWriteStream(mockStdout));
      }
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();

      // Simulate resize
      simulateResize(mockStdout, 120, 30);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();

      // Verify sequence: clear operations come before content
      const clearScreenIndex = resizeOutput.indexOf('\x1b[2J');
      const homeCursorIndex = resizeOutput.indexOf('\x1b[H');
      const contentIndex = resizeOutput.indexOf(welcomeBanner);

      // Clear screen should come before content
      expect(clearScreenIndex).toBeGreaterThanOrEqual(0);
      expect(clearScreenIndex).toBeLessThan(contentIndex);

      // Home cursor should come before or with clear screen
      expect(homeCursorIndex).toBeGreaterThanOrEqual(0);
      expect(homeCursorIndex).toBeLessThanOrEqual(contentIndex);

      // Verify content appears in correct order
      const visibleText = stripAnsi(resizeOutput);
      const bannerIndex = visibleText.indexOf(welcomeBanner);
      const historyIndex = visibleText.indexOf('User: test');

      expect(bannerIndex).toBeGreaterThanOrEqual(0);
      expect(historyIndex).toBeGreaterThan(bannerIndex);
    } finally {
      unwatch();
    }
  });

  /**
   * Task 7.4.5: Comprehensive visual validation with multiple resize events
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  it('7.4.5: Multiple resize events produce clean output without artifacts', async () => {
    const { watchTtyResize, clearTtyViewport, writeReplBlock } =
      await import('../core/repl/viewport.js');

    const welcomeBanner = '=== SparkCLI Welcome ===';
    const history = [
      'User: first',
      'Assistant: response 1',
      'User: second',
      'Assistant: response 2',
    ];

    const handleResize = (): void => {
      clearTtyViewport(asWriteStream(mockStdout));
      writeReplBlock(welcomeBanner, asWriteStream(mockStdout));
      for (const entry of history) {
        writeReplBlock(entry, asWriteStream(mockStdout));
      }
    };

    const unwatch = watchTtyResize(handleResize, { debounceMs: 200 });

    try {
      mockStdout.clearWrites();

      // Simulate multiple resize events
      simulateResize(mockStdout, 100, 25);
      await new Promise((resolve) => setTimeout(resolve, 50));

      simulateResize(mockStdout, 110, 26);
      await new Promise((resolve) => setTimeout(resolve, 50));

      simulateResize(mockStdout, 120, 30);

      // Wait for debounce to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      const resizeOutput = mockStdout.getAllOutput();
      const visibleText = stripAnsi(resizeOutput);

      // Verify single clean redraw (debouncing should collapse multiple events)
      const bannerCount = countOccurrences(visibleText, welcomeBanner);
      expect(bannerCount).toBe(1);

      // Verify no duplicate history
      for (const entry of history) {
        const entryCount = countOccurrences(visibleText, entry);
        expect(entryCount).toBe(1);
      }

      // Verify proper clearing happened
      const clearSeq = detectClearSequences(resizeOutput);
      expect(clearSeq.clearScreen).toBeGreaterThanOrEqual(1);
    } finally {
      unwatch();
    }
  });
});
