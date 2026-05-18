/**
 * Test for Task 3.3: Verify onResize callback async-awareness
 * 
 * This test verifies that watchTtyResize properly awaits async callbacks
 * and ensures serialization of resize operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import { watchTtyResize } from './viewport.js';

/**
 * Mock stdout for testing
 */
class MockStdout extends Writable {
  public columns = 80;
  public rows = 24;
  public isTTY = true;

  _write(_chunk: Buffer | string, _encoding: string, callback: () => void): void {
    callback();
  }
}

describe('Task 3.3: watchTtyResize async-awareness', () => {
  let originalStdout: NodeJS.WriteStream;
  let mockStdout: MockStdout;

  beforeEach(() => {
    originalStdout = process.stdout;
    mockStdout = new MockStdout();
    
    Object.defineProperty(process, 'stdout', {
      value: mockStdout,
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
  });

  it('should await async callback completion before allowing next resize', async () => {
    const executionOrder: string[] = [];
    let callbackInProgress = false;
    
    const asyncCallback = async (): Promise<void> => {
      executionOrder.push('callback-start');
      
      // Verify no concurrent execution
      expect(callbackInProgress).toBe(false);
      callbackInProgress = true;
      
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      callbackInProgress = false;
      executionOrder.push('callback-end');
    };

    const unwatch = watchTtyResize(asyncCallback, { debounceMs: 100 });

    try {
      // Trigger first resize
      mockStdout.columns = 100;
      mockStdout.rows = 30;
      mockStdout.emit('resize');
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Wait for callback to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify callback executed
      expect(executionOrder).toEqual(['callback-start', 'callback-end']);
      
      // Trigger second resize
      executionOrder.length = 0;
      mockStdout.columns = 120;
      mockStdout.rows = 35;
      mockStdout.emit('resize');
      
      // Wait for debounce and execution
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify second callback executed
      expect(executionOrder).toEqual(['callback-start', 'callback-end']);
      
    } finally {
      unwatch();
    }
  });

  it('should prevent concurrent resize operations with resizePending flag', async () => {
    let concurrentCallCount = 0;
    let maxConcurrent = 0;
    
    const asyncCallback = async (): Promise<void> => {
      concurrentCallCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCallCount);
      
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      concurrentCallCount--;
    };

    const unwatch = watchTtyResize(asyncCallback, { debounceMs: 100 });

    try {
      // Trigger multiple rapid resizes
      for (let i = 0; i < 5; i++) {
        mockStdout.columns = 80 + i * 10;
        mockStdout.rows = 24 + i;
        mockStdout.emit('resize');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      // Wait for all operations to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify only one callback executed at a time
      expect(maxConcurrent).toBe(1);
      
    } finally {
      unwatch();
    }
  });

  it('should handle sync callbacks without breaking', async () => {
    let callCount = 0;
    
    const syncCallback = (): void => {
      callCount++;
    };

    const unwatch = watchTtyResize(syncCallback, { debounceMs: 100 });

    try {
      // Trigger resize
      mockStdout.columns = 100;
      mockStdout.rows = 30;
      mockStdout.emit('resize');
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify callback executed
      expect(callCount).toBe(1);
      
    } finally {
      unwatch();
    }
  });

  it('should deduplicate same-size resizes (Task 3.2)', async () => {
    let callCount = 0;
    
    const callback = async (): Promise<void> => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 10));
    };

    const unwatch = watchTtyResize(callback, { debounceMs: 100 });

    try {
      // Trigger resize to new size
      mockStdout.columns = 100;
      mockStdout.rows = 30;
      mockStdout.emit('resize');
      
      // Wait for debounce and execution
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(callCount).toBe(1);
      
      // Trigger resize to SAME size (should be deduplicated)
      mockStdout.emit('resize');
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should still be 1 (not 2)
      expect(callCount).toBe(1);
      
      // Trigger resize to DIFFERENT size
      mockStdout.columns = 120;
      mockStdout.rows = 35;
      mockStdout.emit('resize');
      
      // Wait for debounce and execution
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should now be 2
      expect(callCount).toBe(2);
      
    } finally {
      unwatch();
    }
  });
});
