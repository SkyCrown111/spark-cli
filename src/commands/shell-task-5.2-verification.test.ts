/**
 * Task 5.2 Verification Test
 * 
 * Verifies that complete viewport clear including InputBox chrome is performed.
 * Tests the aggressive clear sequence and ensures all InputBox chrome lines are erased.
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Task 5.2 Verification: Complete viewport clear including InputBox chrome', () => {
  let mockStdout: any;
  let writes: string[];

  beforeEach(() => {
    writes = [];
    mockStdout = {
      isTTY: true,
      columns: 80,
      rows: 24,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    };
  });

  it('should use comprehensive clear sequence including scrollback', async () => {
    const { clearTtyViewport } = await import('../core/repl/viewport.js');
    
    clearTtyViewport(mockStdout);
    
    // Verify the comprehensive clear sequence is used
    const output = writes.join('');
    expect(output).toContain('\x1b[H'); // Home cursor
    expect(output).toContain('\x1b[2J'); // Clear screen
    expect(output).toContain('\x1b[3J'); // Clear scrollback buffer (fix for duplicate rendering)
    
    // Verify the sequence appears in the first write
    expect(writes[0]).toBe('\x1b[2J\x1b[3J\x1b[H\x1b[2J');
  });

  it('should clear entire viewport including all InputBox chrome lines', async () => {
    const { clearTtyViewport } = await import('../core/repl/viewport.js');
    
    // Simulate InputBox chrome being present (mode line, footer, input area)
    mockStdout.write('Mode: chat\n'); // Mode line
    mockStdout.write('> user input here\n'); // Input line
    mockStdout.write('Tab: complete | Shift+Tab: cycle mode\n'); // Footer
    
    writes = []; // Reset to track clear operation
    
    // Perform clear
    clearTtyViewport(mockStdout);
    
    // Verify clear sequence was written
    expect(writes.length).toBeGreaterThan(0);
    const clearOutput = writes.join('');
    
    // Verify home cursor + clear screen
    expect(clearOutput).toContain('\x1b[H'); // Cursor to home (0,0)
    expect(clearOutput).toContain('\x1b[2J'); // Clear entire screen
  });

  it('should clear scrollback buffer to prevent duplicate rendering on resize', async () => {
    const { clearTtyViewport } = await import('../core/repl/viewport.js');
    
    clearTtyViewport(mockStdout);
    
    const output = writes.join('');
    
    // Verify scrollback IS cleared (\x1b[3J) to fix duplicate rendering bug
    // This is essential for Windows terminals where old content gets pushed to scrollback
    expect(output).toContain('\x1b[3J');
    
    // Also verify screen clear
    expect(output).toContain('\x1b[2J');
  });

  it('should ensure complete clear before any redraw operations', async () => {
    const { clearTtyViewport, writeReplBlock } = await import('../core/repl/viewport.js');
    
    // Simulate the sequence in rerenderLayout
    const callSequence: string[] = [];
    
    // 1. Clear viewport
    callSequence.push('clear');
    clearTtyViewport(mockStdout);
    
    // 2. Redraw content
    callSequence.push('redraw');
    writeReplBlock('Welcome banner', mockStdout);
    
    // Verify sequence
    expect(callSequence).toEqual(['clear', 'redraw']);
    
    // Verify clear happened first
    const clearIndex = writes.findIndex(w => w.includes('\x1b[2J'));
    const contentIndex = writes.findIndex(w => w.includes('Welcome'));
    
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(contentIndex).toBeGreaterThan(clearIndex);
  });

  it('should handle case when InputBox chrome has multiple lines', async () => {
    const { clearTtyViewport } = await import('../core/repl/viewport.js');
    
    // Simulate multi-line InputBox chrome
    mockStdout.write('╭─ Mode: chat ─────────────────────────────────╮\n');
    mockStdout.write('│ > line 1 of multi-line input                │\n');
    mockStdout.write('│ > line 2 of multi-line input                │\n');
    mockStdout.write('│ > line 3 of multi-line input                │\n');
    mockStdout.write('╰─ Tab: complete | Shift+Tab: cycle mode ─────╯\n');
    
    writes = []; // Reset
    
    // Clear should erase all lines
    clearTtyViewport(mockStdout);
    
    const output = writes.join('');
    
    // Verify comprehensive clear sequence (including scrollback)
    expect(output).toContain('\x1b[2J\x1b[3J\x1b[H\x1b[2J');
    
    // The clear sequence should handle all lines regardless of count
    // \x1b[2J clears the entire screen buffer
    // \x1b[3J clears the scrollback buffer
  });

  it('should work correctly in rerenderLayout context', async () => {
    const { clearTtyViewport, writeReplBlock } = await import('../core/repl/viewport.js');
    
    // Simulate the full rerenderLayout sequence
    let layoutRerendering = false;
    let inputDraft: string | undefined;
    
    // Mock InputBox
    const mockInputBox = {
      isVisible: true,
      suspendForRerender: () => {
        inputDraft = 'user draft content';
        return inputDraft;
      },
      resumeAfterRerender: (draft: string) => {
        expect(draft).toBe('user draft content');
      },
    };
    
    // Simulate rerenderLayout
    if (!layoutRerendering) {
      layoutRerendering = true;
      
      try {
        // 1. Suspend InputBox
        const draft = mockInputBox.isVisible ? mockInputBox.suspendForRerender() : undefined;
        
        // 2. Clear viewport (Task 5.2)
        clearTtyViewport(mockStdout);
        
        // 3. Redraw content
        writeReplBlock('Welcome to SparkCLI', mockStdout);
        writeReplBlock('Previous conversation...', mockStdout);
        
        // 4. Resume InputBox
        if (draft) {
          mockInputBox.resumeAfterRerender(draft);
        }
      } finally {
        layoutRerendering = false;
      }
    }
    
    // Verify the sequence
    const output = writes.join('');
    
    // Clear should happen before content
    const clearIndex = output.indexOf('\x1b[2J');
    const welcomeIndex = output.indexOf('Welcome');
    
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(welcomeIndex).toBeGreaterThan(clearIndex);
  });
});
