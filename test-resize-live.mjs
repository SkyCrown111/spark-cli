#!/usr/bin/env node
/**
 * Live test of the resize fix
 * This simulates what SparkCLI does
 */

import { createInterface } from 'node:readline';

let layoutRerendering = false;
let resizeCount = 0;
let rerenderCount = 0;

// Simulate clearTtyViewport
function clearScreen() {
  process.stdout.write('\x1b[H\x1b[2J');
}

// Simulate rerenderLayout
async function rerenderLayout() {
  console.log(`\n[DEBUG] rerenderLayout called (rerender #${++rerenderCount})`);
  
  // Task 4.1: Atomic check-and-set
  if (layoutRerendering) {
    console.log('[DEBUG] ⚠️  Blocked: layoutRerendering already true');
    return;
  }
  layoutRerendering = true;
  console.log('[DEBUG] ✓ layoutRerendering set to true');
  
  try {
    clearScreen();
    console.log('=== SparkCLI Welcome ===');
    console.log('Terminal resized successfully!');
    console.log(`Resize count: ${resizeCount}`);
    console.log(`Rerender count: ${rerenderCount}`);
    console.log('\nResize the window to test...');
    
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 50));
  } finally {
    layoutRerendering = false;
    console.log('[DEBUG] ✓ layoutRerendering reset to false');
  }
}

// Simulate handleTerminalResize
async function handleTerminalResize() {
  resizeCount++;
  console.log(`\n[DEBUG] handleTerminalResize called (resize #${resizeCount})`);
  await rerenderLayout();
}

// Simulate watchTtyResize with all fixes
function watchTtyResize(onResize, opts = {}) {
  const debounceMs = opts.debounceMs ?? 200;
  let cols = process.stdout.columns ?? 80;
  let rows = process.stdout.rows ?? 24;
  let timer;
  let resizePending = false;
  let lastProcessedCols = cols;
  let lastProcessedRows = rows;
  
  const schedule = () => {
    const nextCols = process.stdout.columns ?? 80;
    const nextRows = process.stdout.rows ?? 24;
    
    console.log(`\n[DEBUG] schedule() called: ${cols}x${rows} → ${nextCols}x${nextRows}`);
    
    // Task 3.2: Skip if size hasn't changed
    if (nextCols === cols && nextRows === rows) {
      console.log('[DEBUG] ⚠️  Skipped: size unchanged');
      return;
    }
    
    cols = nextCols;
    rows = nextRows;
    
    // Task 3.1: Skip if resize pending
    if (resizePending) {
      console.log('[DEBUG] ⚠️  Skipped: resizePending is true');
      return;
    }
    
    if (timer) {
      console.log('[DEBUG] Clearing existing timer');
      clearTimeout(timer);
    }
    
    console.log(`[DEBUG] Setting timer (${debounceMs}ms)`);
    timer = setTimeout(async () => {
      timer = undefined;
      console.log('[DEBUG] Timer fired');
      
      // Task 3.2: Check if already processed
      if (cols === lastProcessedCols && rows === lastProcessedRows) {
        console.log('[DEBUG] ⚠️  Skipped: already processed this size');
        return;
      }
      
      // Task 3.1: Set flag
      resizePending = true;
      console.log('[DEBUG] ✓ resizePending set to true');
      
      try {
        await onResize();
        lastProcessedCols = cols;
        lastProcessedRows = rows;
        console.log('[DEBUG] ✓ onResize completed');
      } finally {
        resizePending = false;
        console.log('[DEBUG] ✓ resizePending reset to false');
      }
    }, debounceMs);
  };
  
  process.stdout.on('resize', schedule);
  
  return () => {
    process.stdout.off('resize', schedule);
    if (timer) clearTimeout(timer);
  };
}

// Start monitoring
clearScreen();
console.log('=== Resize Fix Live Test ===');
console.log('This test includes all fixes from Tasks 3-6');
console.log('\nResize the terminal window and watch for:');
console.log('  ✓ Single rerender per resize');
console.log('  ✓ No duplicate "rerenderLayout called" messages');
console.log('  ✓ Proper flag management\n');
console.log('Initial state:');
console.log(`  Size: ${process.stdout.columns}x${process.stdout.rows}`);
console.log(`  Resize count: ${resizeCount}`);
console.log(`  Rerender count: ${rerenderCount}`);
console.log('\nPress Ctrl+C to exit\n');

const unwatch = watchTtyResize(handleTerminalResize, { debounceMs: 200 });

// Keep process alive
process.on('SIGINT', () => {
  unwatch();
  console.log('\n\n=== Final Statistics ===');
  console.log(`Total resizes detected: ${resizeCount}`);
  console.log(`Total rerenders executed: ${rerenderCount}`);
  console.log(`Ratio: ${rerenderCount}/${resizeCount} = ${(rerenderCount/resizeCount).toFixed(2)}`);
  console.log('\nExpected ratio: ~1.0 (one rerender per resize)');
  process.exit(0);
});
