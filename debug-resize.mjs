#!/usr/bin/env node
/**
 * Debug script to trace resize events in real-time
 * Usage: node debug-resize.mjs
 */

let resizeCount = 0;
let lastCols = process.stdout.columns;
let lastRows = process.stdout.rows;

console.log('=== Resize Debug Monitor ===');
console.log(`Initial size: ${lastCols}x${lastRows}`);
console.log('Resize the terminal window to see events...\n');

process.stdout.on('resize', () => {
  resizeCount++;
  const newCols = process.stdout.columns;
  const newRows = process.stdout.rows;
  const timestamp = new Date().toISOString();
  
  console.log(`[${timestamp}] Resize #${resizeCount}: ${lastCols}x${lastRows} → ${newCols}x${newRows}`);
  
  if (newCols === lastCols && newRows === lastRows) {
    console.log('  ⚠️  WARNING: Duplicate event (size unchanged)');
  }
  
  lastCols = newCols;
  lastRows = newRows;
});

// Keep the process running
setInterval(() => {
  // Check for size changes via polling (simulates what watchTtyResize does)
  const currentCols = process.stdout.columns;
  const currentRows = process.stdout.rows;
  
  if (currentCols !== lastCols || currentRows !== lastRows) {
    console.log(`[POLL] Size changed: ${lastCols}x${lastRows} → ${currentCols}x${currentRows}`);
    lastCols = currentCols;
    lastRows = currentRows;
  }
}, 250);

console.log('\nPress Ctrl+C to exit');
