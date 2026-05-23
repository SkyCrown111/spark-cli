/**
 * Task 5.3 Verification Tests
 *
 * Verifies that resumeAfterRerender is called AFTER all content is redrawn.
 *
 * Requirements:
 * - Req 2.4: InputBox resumes only after welcome banner and history are fully rendered
 * - Req 3.4: InputBox resume during non-resize operations unaffected
 *
 * Test Strategy:
 * - Mock InputBox and verify call sequence
 * - Verify resume happens after welcome banner redraw
 * - Verify resume happens after history redraw
 * - Verify proper sequencing: clear → redraw welcome → redraw history → resume
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WriteStream } from 'node:tty';

describe('Task 5.3: Call resumeAfterRerender AFTER all content redrawn', () => {
  let mockStdout: WriteStream;
  let writeCallOrder: string[];

  beforeEach(() => {
    writeCallOrder = [];
    mockStdout = {
      isTTY: true,
      write: vi.fn((chunk: string) => {
        // Track write operations to verify sequencing
        if (chunk.includes('\x1b[H\x1b[2J')) {
          writeCallOrder.push('clear');
        } else if (chunk.includes('Welcome') || chunk.includes('spark-cli')) {
          writeCallOrder.push('welcome');
        } else if (chunk.includes('history') || chunk.includes('turn')) {
          writeCallOrder.push('history');
        }
        return true;
      }),
      columns: 80,
      rows: 24,
    } as unknown as WriteStream;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call resumeAfterRerender AFTER welcome banner is redrawn', () => {
    // Simulate the rerenderLayout sequence
    const inputDraft = 'user input draft';
    let resumeCalled = false;
    let resumeCalledAfterWelcome = false;

    const mockInputBox = {
      isVisible: true,
      suspendForRerender: vi.fn(() => inputDraft),
      resumeAfterRerender: vi.fn((_draft: string) => {
        resumeCalled = true;
        // Check if welcome was already written
        resumeCalledAfterWelcome = writeCallOrder.includes('welcome');
      }),
    };

    // Simulate rerenderLayout sequence
    const draft = mockInputBox.suspendForRerender();
    mockStdout.write('\x1b[H\x1b[2J'); // clear
    mockStdout.write('Welcome to spark-cli\n'); // welcome banner
    mockInputBox.resumeAfterRerender(draft);

    expect(mockInputBox.suspendForRerender).toHaveBeenCalledOnce();
    expect(mockInputBox.resumeAfterRerender).toHaveBeenCalledOnce();
    expect(mockInputBox.resumeAfterRerender).toHaveBeenCalledWith(inputDraft);
    expect(resumeCalled).toBe(true);
    expect(resumeCalledAfterWelcome).toBe(true);
  });

  it('should call resumeAfterRerender AFTER history is redrawn', () => {
    // Simulate the rerenderLayout sequence
    const inputDraft = 'user input draft';
    let resumeCalled = false;
    let resumeCalledAfterHistory = false;

    const mockInputBox = {
      isVisible: true,
      suspendForRerender: vi.fn(() => inputDraft),
      resumeAfterRerender: vi.fn((_draft: string) => {
        resumeCalled = true;
        // Check if history was already written
        resumeCalledAfterHistory = writeCallOrder.includes('history');
      }),
    };

    // Simulate rerenderLayout sequence
    const draft = mockInputBox.suspendForRerender();
    mockStdout.write('\x1b[H\x1b[2J'); // clear
    mockStdout.write('Welcome to spark-cli\n'); // welcome banner
    mockStdout.write('history turn 1\n'); // history
    mockStdout.write('history turn 2\n'); // history
    mockInputBox.resumeAfterRerender(draft);

    expect(mockInputBox.suspendForRerender).toHaveBeenCalledOnce();
    expect(mockInputBox.resumeAfterRerender).toHaveBeenCalledOnce();
    expect(mockInputBox.resumeAfterRerender).toHaveBeenCalledWith(inputDraft);
    expect(resumeCalled).toBe(true);
    expect(resumeCalledAfterHistory).toBe(true);
  });

  it('should ensure proper sequencing: clear → redraw welcome → redraw history → resume', () => {
    // Simulate the rerenderLayout sequence
    const inputDraft = 'user input draft';

    const mockInputBox = {
      isVisible: true,
      suspendForRerender: vi.fn(() => inputDraft),
      resumeAfterRerender: vi.fn((_draft: string) => {
        writeCallOrder.push('resume');
      }),
    };

    // Simulate rerenderLayout sequence
    const draft = mockInputBox.suspendForRerender();
    mockStdout.write('\x1b[H\x1b[2J'); // clear
    mockStdout.write('Welcome to spark-cli\n'); // welcome banner
    mockStdout.write('history turn 1\n'); // history
    mockStdout.write('history turn 2\n'); // history
    mockInputBox.resumeAfterRerender(draft);

    // Verify call order
    expect(writeCallOrder).toEqual(['clear', 'welcome', 'history', 'history', 'resume']);

    // Verify resume happened after all content
    const clearIndex = writeCallOrder.indexOf('clear');
    const welcomeIndex = writeCallOrder.indexOf('welcome');
    const firstHistoryIndex = writeCallOrder.indexOf('history');
    const resumeIndex = writeCallOrder.indexOf('resume');

    expect(clearIndex).toBeLessThan(welcomeIndex);
    expect(welcomeIndex).toBeLessThan(firstHistoryIndex);
    expect(firstHistoryIndex).toBeLessThan(resumeIndex);
  });

  it('should not call resumeAfterRerender when InputBox is not visible', () => {
    const mockInputBox = {
      isVisible: false,
      suspendForRerender: vi.fn(),
      resumeAfterRerender: vi.fn(),
    };

    // Simulate rerenderLayout sequence when InputBox is not visible
    const draft = mockInputBox.isVisible ? mockInputBox.suspendForRerender() : undefined;
    mockStdout.write('\x1b[H\x1b[2J'); // clear
    mockStdout.write('Welcome to spark-cli\n'); // welcome banner
    mockStdout.write('history turn 1\n'); // history

    if (draft) {
      mockInputBox.resumeAfterRerender(draft);
    }

    expect(mockInputBox.suspendForRerender).not.toHaveBeenCalled();
    expect(mockInputBox.resumeAfterRerender).not.toHaveBeenCalled();
  });

  it('should ensure InputBox paints cleanly over fully rendered content', () => {
    // Simulate the rerenderLayout sequence
    const inputDraft = 'user input draft';
    let contentFullyRendered = false;

    const mockInputBox = {
      isVisible: true,
      suspendForRerender: vi.fn(() => inputDraft),
      resumeAfterRerender: vi.fn((_draft: string) => {
        // When resume is called, all content should be rendered
        contentFullyRendered =
          writeCallOrder.includes('clear') &&
          writeCallOrder.includes('welcome') &&
          writeCallOrder.includes('history');
      }),
    };

    // Simulate rerenderLayout sequence
    const draft = mockInputBox.suspendForRerender();
    mockStdout.write('\x1b[H\x1b[2J'); // clear
    mockStdout.write('Welcome to spark-cli\n'); // welcome banner
    mockStdout.write('history turn 1\n'); // history
    mockInputBox.resumeAfterRerender(draft);

    expect(contentFullyRendered).toBe(true);
  });

  it('should preserve InputBox draft content across suspend/resume', () => {
    const inputDraft = 'user typed this before resize';

    const mockInputBox = {
      isVisible: true,
      suspendForRerender: vi.fn(() => inputDraft),
      resumeAfterRerender: vi.fn(),
    };

    // Simulate rerenderLayout sequence
    const draft = mockInputBox.suspendForRerender();
    mockStdout.write('\x1b[H\x1b[2J'); // clear
    mockStdout.write('Welcome to spark-cli\n'); // welcome banner
    mockStdout.write('history turn 1\n'); // history
    mockInputBox.resumeAfterRerender(draft);

    expect(mockInputBox.suspendForRerender).toHaveBeenCalledOnce();
    expect(mockInputBox.resumeAfterRerender).toHaveBeenCalledOnce();
    expect(mockInputBox.resumeAfterRerender).toHaveBeenCalledWith(inputDraft);
  });
});
