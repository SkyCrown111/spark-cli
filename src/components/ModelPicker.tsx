/**
 * ModelPicker — interactive model selection overlay.
 *
 * Displays a list of available models grouped by provider,
 * with j/k navigation and Enter to select. Launched via
 * Meta+P keybinding or /model slash command.
 *
 * Based on CustomSelect for navigation and selection logic.
 */

import React, { useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { CustomSelect, type SelectOption } from './CustomSelect/index.js';
import { useRegisterKeybindingContext } from '../keybindings/useKeybinding.js';
import { BUILTIN_PROVIDERS } from '../core/providers/registry.js';

// ── Props ──────────────────────────────────────────────

export interface ModelPickerProps {
  /** Currently active model (e.g., "openai/gpt-4o") */
  currentModel: string;
  /** Callback when user selects a model */
  onSelect: (model: string) => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Available models (from config + built-in defaults) */
  availableModels?: string[];
}

// ── Component ──────────────────────────────────────────

export const ModelPicker: React.FC<ModelPickerProps> = ({
  currentModel,
  onSelect,
  onCancel,
  availableModels,
}) => {
  // Register ModelPicker context for keybinding resolution
  useRegisterKeybindingContext('ModelPicker');

  // Build options list
  const options = useMemo<SelectOption[]>(() => {
    // If explicit models provided, use them
    if (availableModels && availableModels.length > 0) {
      return availableModels.map((model) => ({
        value: model,
        label: model,
        selected: model === currentModel,
      }));
    }

    // Otherwise, list built-in provider examples
    const opts: SelectOption[] = [];

    // Add current model first if not in defaults
    if (currentModel && currentModel !== 'loading...') {
      const alreadyIncluded = BUILTIN_PROVIDERS.some((_p: any) =>
        _p.exampleModels.some((_m: any) => `${_p.id}/${_m}` === currentModel),
      );
      if (!alreadyIncluded) {
        opts.push({
          value: currentModel,
          label: `● ${currentModel} (current)`,
          selected: true,
        });
      }
    }

    // Add built-in provider models
    for (const provider of BUILTIN_PROVIDERS) {
      for (const model of provider.exampleModels) {
        const fullId = `${provider.id}/${model}`;
        opts.push({
          value: fullId,
          label: `${provider.label} → ${model}`,
          selected: fullId === currentModel,
        });
      }
    }

    return opts;
  }, [currentModel, availableModels]);

  const handleSelect = useCallback(
    (value: string) => {
      onSelect(value);
    },
    [onSelect],
  );

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box paddingBottom={1}>
        <Text bold color="cyan">
          Select Model
        </Text>
        <Text dimColor> — current: {currentModel}</Text>
      </Box>

      <CustomSelect
        options={options}
        initialFocus={currentModel}
        onSelect={handleSelect}
        onCancel={onCancel}
        header="Available Models"
        maxVisible={12}
      />
    </Box>
  );
};
