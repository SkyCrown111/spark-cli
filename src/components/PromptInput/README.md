# PromptInput Component

The `PromptInput` component is a sophisticated input component for user prompts with advanced features like multi-line input, cursor movement, mode switching, and input history.

## Features

- ✅ Multi-line input support (Shift+Enter for new line)
- ✅ Cursor movement (Left/Right arrows)
- ✅ Backspace and Delete support
- ✅ Mode switching (chat/direct/plan) with Shift+Tab
- ✅ Input history navigation (Up/Down arrows)
- ✅ Visual cursor indicator
- ✅ Disabled state support
- ✅ Customizable placeholder
- ✅ Maximum line limit for multi-line input

## Usage

### Basic Usage

```tsx
import { PromptInput } from './components/PromptInput';

function MyApp() {
  const handleSubmit = (text: string) => {
    console.log('User submitted:', text);
  };

  return <PromptInput onSubmit={handleSubmit} />;
}
```

### With Mode Switching

```tsx
import { PromptInput, InputMode } from './components/PromptInput';
import { useState } from 'react';

function MyApp() {
  const [mode, setMode] = useState<InputMode>('chat');

  const handleSubmit = (text: string) => {
    console.log(`[${mode}] User submitted:`, text);
  };

  const handleModeChange = (newMode: InputMode) => {
    setMode(newMode);
    console.log('Mode changed to:', newMode);
  };

  return (
    <PromptInput 
      onSubmit={handleSubmit}
      mode={mode}
      onModeChange={handleModeChange}
    />
  );
}
```

### With Input History

```tsx
import { PromptInput } from './components/PromptInput';
import { useState } from 'react';

function MyApp() {
  const [history, setHistory] = useState<string[]>([]);

  const handleSubmit = (text: string) => {
    // Add to history
    setHistory(prev => [...prev, text]);
    console.log('User submitted:', text);
  };

  return (
    <PromptInput 
      onSubmit={handleSubmit}
      history={history}
    />
  );
}
```

### With Disabled State

```tsx
import { PromptInput } from './components/PromptInput';
import { useState } from 'react';

function MyApp() {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (text: string) => {
    setIsProcessing(true);
    try {
      await processUserInput(text);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <PromptInput 
      onSubmit={handleSubmit}
      disabled={isProcessing}
      placeholder={isProcessing ? 'Processing...' : 'Type your message...'}
    />
  );
}
```

### Single-line Mode

```tsx
import { PromptInput } from './components/PromptInput';

function MyApp() {
  return (
    <PromptInput 
      onSubmit={(text) => console.log(text)}
      multiline={false}
    />
  );
}
```

### Custom Max Lines

```tsx
import { PromptInput } from './components/PromptInput';

function MyApp() {
  return (
    <PromptInput 
      onSubmit={(text) => console.log(text)}
      multiline={true}
      maxLines={5}
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSubmit` | `(text: string) => void` | **Required** | Callback when user submits input (presses Enter) |
| `placeholder` | `string` | `'Type your message...'` | Placeholder text when input is empty |
| `mode` | `'chat' \| 'direct' \| 'plan'` | `'chat'` | Current input mode |
| `onModeChange` | `(mode: InputMode) => void` | `undefined` | Callback when mode changes (Shift+Tab) |
| `disabled` | `boolean` | `false` | Whether the input is disabled |
| `history` | `string[]` | `[]` | Input history for up/down arrow navigation |
| `onHistoryNavigate` | `(index: number) => void` | `undefined` | Callback when history navigation occurs |
| `multiline` | `boolean` | `true` | Whether to support multi-line input |
| `maxLines` | `number` | `10` | Maximum number of lines for multi-line input |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit input (single-line or when multiline is false) |
| `Shift+Enter` | New line (when multiline is true) |
| `Shift+Tab` | Cycle through modes (chat → direct → plan → chat) |
| `↑` (Up Arrow) | Navigate to previous history item |
| `↓` (Down Arrow) | Navigate to next history item |
| `←` (Left Arrow) | Move cursor left |
| `→` (Right Arrow) | Move cursor right |
| `Backspace` | Delete character before cursor |
| `Delete` | Delete character before cursor |

## Mode Colors

Each mode has a distinct color for visual identification:

- **chat**: Cyan
- **direct**: Green
- **plan**: Magenta

## Implementation Notes

### Testing

The component uses Ink's `useInput` hook for keyboard input handling. Due to limitations in `ink-testing-library`, interactive features (typing, backspace, etc.) cannot be fully tested with unit tests. These features require manual integration testing or E2E tests.

The unit tests focus on:
- Component rendering
- Props validation
- Visual structure
- Callback definitions

### Multi-line Support

When `multiline` is enabled:
- Press `Shift+Enter` to create a new line
- Press `Enter` to submit
- The component enforces the `maxLines` limit
- Backspace at the start of a line merges with the previous line

### History Navigation

- History is navigated in reverse order (most recent first)
- Up arrow moves to older items
- Down arrow moves to newer items
- Navigating past the newest item clears the input
- History index is reset after submission

## Examples in the Codebase

See `src/screens/REPL.tsx` for a complete example of using PromptInput in a real application.
