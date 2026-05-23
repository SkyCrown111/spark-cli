/**
 * Default keybindings — all built-in keyboard shortcuts.
 *
 * Organized by context (KeybindingContextName). Each context maps
 * key combinations to action identifiers. The resolver uses these
 * as fallbacks when no user override exists.
 *
 * Platform-adaptive bindings are applied at load time via
 * applyPlatformAdaptations() — see B2.
 */

import type { KeybindingBlock, KeybindingContextName } from './types.js';
import { shiftTabReliable, getImagePasteKey, getModeCycleKey } from '../ink/terminal.js';

// ── Global ──────────────────────────────────────────────

const globalBindings: Record<string, string> = {
  'ctrl+c': 'app:interrupt',
  'ctrl+d': 'app:exit',
  'ctrl+l': 'app:redraw',
  'ctrl+t': 'app:toggleTodos',
  'ctrl+o': 'app:toggleTranscript',
  'ctrl+q': 'app:cancel',
};

// ── Chat ────────────────────────────────────────────────

const chatBindings: Record<string, string> = {
  enter: 'chat:submit',
  'shift+tab': 'chat:cycleMode',
  'meta+p': 'chat:modelPicker',
  'meta+t': 'chat:toggleThinking',
  'meta+o': 'chat:toggleFastMode',
  'ctrl+f': 'chat:search',
  'ctrl+g': 'chat:externalEditor',
  'ctrl+s': 'chat:stash',
  'ctrl+v': 'chat:imagePaste',
};

// ── Scroll ──────────────────────────────────────────────

const scrollBindings: Record<string, string> = {
  pageup: 'scroll:pageUp',
  pagedown: 'scroll:pageDown',
  'ctrl+home': 'scroll:top',
  'ctrl+end': 'scroll:bottom',
  'ctrl+shift+c': 'selection:copy',
  up: 'scroll:lineUp',
  down: 'scroll:lineDown',
};

// ── Autocomplete ────────────────────────────────────────

const autocompleteBindings: Record<string, string> = {
  tab: 'autocomplete:accept',
  escape: 'autocomplete:dismiss',
};

// ── Confirmation ────────────────────────────────────────

const confirmationBindings: Record<string, string> = {
  y: 'confirm:yes',
  enter: 'confirm:yes',
  a: 'confirm:always',
  n: 'confirm:no',
  escape: 'confirm:no',
};

// ── Select ──────────────────────────────────────────────

const selectBindings: Record<string, string> = {
  k: 'select:previous',
  j: 'select:next',
  'ctrl+p': 'select:previous',
  'ctrl+n': 'select:next',
  up: 'select:previous',
  down: 'select:next',
  enter: 'select:accept',
  escape: 'select:cancel',
};

// ── Settings ────────────────────────────────────────────

const settingsBindings: Record<string, string> = {
  escape: 'settings:close',
  up: 'settings:navigateUp',
  down: 'settings:navigateDown',
  enter: 'settings:toggle',
};

// ── Tabs ────────────────────────────────────────────────

const tabsBindings: Record<string, string> = {
  'ctrl+shift+t': 'tabs:new',
  'ctrl+w': 'tabs:close',
  'ctrl+tab': 'tabs:next',
};

// ── Transcript ──────────────────────────────────────────

const transcriptBindings: Record<string, string> = {
  escape: 'transcript:close',
  'ctrl+f': 'transcript:search',
  pageup: 'transcript:pageUp',
  pagedown: 'transcript:pageDown',
  '{': 'transcript:paragraphUp',
  '}': 'transcript:paragraphDown',
  v: 'transcript:openInEditor',
  '[': 'transcript:writeToScrollback',
};

// ── HistorySearch ───────────────────────────────────────

const historySearchBindings: Record<string, string> = {
  'ctrl+r': 'historySearch:next',
  tab: 'historySearch:accept',
  escape: 'historySearch:dismiss',
};

// ── Task ────────────────────────────────────────────────

const taskBindings: Record<string, string> = {
  'ctrl+b': 'task:background',
  escape: 'task:cancel',
};

// ── ThemePicker ─────────────────────────────────────────

const themePickerBindings: Record<string, string> = {
  escape: 'themePicker:close',
  k: 'themePicker:previous',
  j: 'themePicker:next',
  enter: 'themePicker:accept',
};

// ── ModelPicker ─────────────────────────────────────────

const modelPickerBindings: Record<string, string> = {
  escape: 'modelPicker:close',
  k: 'modelPicker:previous',
  j: 'modelPicker:next',
  enter: 'modelPicker:accept',
};

// ── Help ────────────────────────────────────────────────

const helpBindings: Record<string, string> = {
  escape: 'help:close',
};

// ── Attachments ─────────────────────────────────────────

const attachmentsBindings: Record<string, string> = {
  escape: 'attachments:close',
  'ctrl+v': 'attachments:pasteImage',
  'ctrl+d': 'attachments:removeSelected',
  up: 'attachments:previous',
  down: 'attachments:next',
};

// ── Footer ──────────────────────────────────────────────

const footerBindings: Record<string, string> = {
  'ctrl+k': 'footer:showKeybindings',
};

// ── MessageSelector ─────────────────────────────────────

const messageSelectorBindings: Record<string, string> = {
  up: 'messageSelector:previous',
  down: 'messageSelector:next',
  enter: 'messageSelector:select',
  escape: 'messageSelector:close',
};

// ── MessageActions ──────────────────────────────────────

const messageActionsBindings: Record<string, string> = {
  c: 'messageActions:copy',
  e: 'messageActions:edit',
  escape: 'messageActions:close',
};

// ── DiffDialog ──────────────────────────────────────────

const diffDialogBindings: Record<string, string> = {
  escape: 'diffDialog:close',
  j: 'diffDialog:nextChange',
  k: 'diffDialog:previousChange',
  enter: 'diffDialog:accept',
};

// ── Plugin ──────────────────────────────────────────────

const pluginBindings: Record<string, string> = {
  escape: 'plugin:close',
};

// ── Aggregate into blocks ───────────────────────────────

const rawBlocks: KeybindingBlock[] = [
  { context: 'Global', bindings: globalBindings },
  { context: 'Chat', bindings: chatBindings },
  { context: 'Scroll', bindings: scrollBindings },
  { context: 'Autocomplete', bindings: autocompleteBindings },
  { context: 'Confirmation', bindings: confirmationBindings },
  { context: 'Select', bindings: selectBindings },
  { context: 'Settings', bindings: settingsBindings },
  { context: 'Tabs', bindings: tabsBindings },
  { context: 'Transcript', bindings: transcriptBindings },
  { context: 'HistorySearch', bindings: historySearchBindings },
  { context: 'Task', bindings: taskBindings },
  { context: 'ThemePicker', bindings: themePickerBindings },
  { context: 'ModelPicker', bindings: modelPickerBindings },
  { context: 'Help', bindings: helpBindings },
  { context: 'Attachments', bindings: attachmentsBindings },
  { context: 'Footer', bindings: footerBindings },
  { context: 'MessageSelector', bindings: messageSelectorBindings },
  { context: 'MessageActions', bindings: messageActionsBindings },
  { context: 'DiffDialog', bindings: diffDialogBindings },
  { context: 'Plugin', bindings: pluginBindings },
];

/**
 * Apply platform-adaptive modifications to the default bindings.
 *
 * - Windows without VT: shift+tab → meta+m for mode cycling
 * - Windows: ctrl+v → alt+v for image paste (avoid system paste conflict)
 */
function applyPlatformAdaptations(blocks: KeybindingBlock[]): KeybindingBlock[] {
  const modeCycleKey = getModeCycleKey();
  const imagePasteKey = getImagePasteKey();

  return blocks.map((block) => {
    const bindings = { ...block.bindings };

    // Chat context: adapt mode cycling and image paste keys
    if (block.context === 'Chat') {
      // Replace shift+tab with platform-appropriate key if shift+tab isn't reliable
      if (!shiftTabReliable()) {
        delete bindings['shift+tab'];
        bindings[modeCycleKey] = 'chat:cycleMode';
      }
      // Replace ctrl+v with platform-appropriate image paste key on Windows
      delete bindings['ctrl+v'];
      bindings[imagePasteKey] = 'chat:imagePaste';
    }

    // Attachments context: same image paste adaptation
    if (block.context === 'Attachments') {
      delete bindings['ctrl+v'];
      bindings[imagePasteKey] = 'attachments:pasteImage';
    }

    return { ...block, bindings };
  });
}

/**
 * Get the default keybinding blocks with platform adaptations applied.
 */
export function getDefaultKeybindings(): KeybindingBlock[] {
  return applyPlatformAdaptations(rawBlocks);
}

/**
 * Get bindings for a specific context.
 */
export function getBindingsForContext(context: KeybindingContextName): Record<string, string> {
  const blocks = getDefaultKeybindings();
  const block = blocks.find((b) => b.context === context);
  return block ? { ...block.bindings } : {};
}

/**
 * Get all unique action identifiers from the default bindings.
 */
export function getAllActions(): string[] {
  const blocks = getDefaultKeybindings();
  const actions = new Set<string>();
  for (const block of blocks) {
    for (const action of Object.values(block.bindings)) {
      actions.add(action);
    }
  }
  return Array.from(actions).sort();
}
