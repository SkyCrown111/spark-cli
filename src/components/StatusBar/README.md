# StatusBar Components

Status bar components for displaying mode, model, and token usage information in the SparkCLI REPL interface.

## Components

### StatusBar

Main status bar component that displays comprehensive status information.

**Props:**
- `mode`: Current input mode ('chat' | 'direct' | 'plan')
- `tokensUsed`: Number of tokens used in current session
- `tokensBudget`: Total token budget/limit
- `model`: Current model name
- `status?`: Optional additional status text
- `showBorder?`: Whether to show the border (default: true)
- `showTokenPercentage?`: Whether to show token percentage (default: false)

**Example:**
```tsx
import { StatusBar } from './components/StatusBar';

<StatusBar 
  mode="chat"
  tokensUsed={1000}
  tokensBudget={200000}
  model="gpt-4"
/>
```

**With optional features:**
```tsx
<StatusBar 
  mode="direct"
  tokensUsed={150000}
  tokensBudget={200000}
  model="claude-3-opus"
  status="Processing..."
  showTokenPercentage={true}
  showBorder={false}
/>
```

### ModeIndicator

Displays the current input mode with appropriate styling.

**Props:**
- `mode`: Current input mode ('chat' | 'direct' | 'plan')
- `showLabel?`: Whether to show the "Mode:" label (default: true)

**Example:**
```tsx
import { ModeIndicator } from './components/StatusBar';

<ModeIndicator mode="chat" />
<ModeIndicator mode="direct" showLabel={false} />
```

**Mode Colors:**
- `chat`: cyan
- `direct`: green
- `plan`: magenta

### TokenCounter

Displays token usage information with color-coded status.

**Props:**
- `tokensUsed`: Number of tokens used
- `tokensBudget`: Total token budget/limit
- `showLabel?`: Whether to show the "Tokens:" label (default: true)
- `showPercentage?`: Whether to show percentage (default: false)

**Example:**
```tsx
import { TokenCounter } from './components/StatusBar';

<TokenCounter tokensUsed={1000} tokensBudget={200000} />
<TokenCounter 
  tokensUsed={150000} 
  tokensBudget={200000} 
  showPercentage={true} 
/>
```

**Color Coding:**
- Green: < 70% usage
- Yellow: 70-89% usage
- Red: ≥ 90% usage

**Number Formatting:**
- Numbers < 1,000: displayed as-is (e.g., "500")
- Numbers ≥ 1,000: displayed with K suffix (e.g., "5.0K")
- Numbers ≥ 1,000,000: displayed with M suffix (e.g., "1.5M")

## Layout

The StatusBar component uses a three-column layout:

```
┌─────────────────────────────────────────────────────────────┐
│ Mode: Chat        Model: gpt-4        Tokens: 1.0K/200.0K  │
└─────────────────────────────────────────────────────────────┘
```

With optional status text:

```
┌─────────────────────────────────────────────────────────────┐
│ Mode: Chat        Model: gpt-4        Tokens: 1.0K/200.0K  │
│ Status: Processing...                                       │
└─────────────────────────────────────────────────────────────┘
```

## Integration

The StatusBar is designed to be used at the bottom of the REPL interface, above the PromptInput component:

```tsx
import { Box } from './components/design-system/Box';
import { StatusBar } from './components/StatusBar';
import { PromptInput } from './components/PromptInput';

<Box flexDirection="column" height={height}>
  {/* Messages area */}
  <Box flexGrow={1}>
    {/* ... messages ... */}
  </Box>
  
  {/* Status bar */}
  <StatusBar 
    mode={mode}
    tokensUsed={tokensUsed}
    tokensBudget={tokensBudget}
    model={model}
  />
  
  {/* Input */}
  <PromptInput 
    onSubmit={handleSubmit}
    mode={mode}
  />
</Box>
```

## Testing

All components have comprehensive unit tests:

```bash
# Run all StatusBar tests
pnpm exec vitest run src/components/StatusBar/

# Run specific test file
pnpm exec vitest run src/components/StatusBar/StatusBar.test.tsx
```

## Dependencies

- `ink`: React-based TUI framework
- `react`: React library
- Design system components: `Box`, `Text`
- PromptInput types: `InputMode`
