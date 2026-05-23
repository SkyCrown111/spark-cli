/**
 * Prompt hook handler.
 *
 * Builds a prompt from a template by replacing {{field}} placeholders
 * with values from the hook payload, then calls the LLM provider
 * and returns the response.
 */

import type { SingleHookResult } from './runner.js';
import type { HookPayload } from './events.js';

export interface PromptHandlerOptions {
  promptTemplate: string;
  payload: HookPayload;
  timeoutMs?: number;
  label?: string;
  /** Completion function for LLM calls. */
  completeFn?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
}

/**
 * Replace {{field}} placeholders in template with payload values.
 * Nested fields use dot notation: {{tool}} or {{files.0.path}}.
 */
function renderTemplate(template: string, data: unknown): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const parts = key.trim().split('.');
    let value: unknown = data;
    for (const part of parts) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else if (Array.isArray(value) && /^\d+$/.test(part)) {
        value = value[parseInt(part, 10)];
      } else {
        return '';
      }
    }
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  });
}

export async function executePromptHook(opts: PromptHandlerOptions): Promise<SingleHookResult> {
  const label = opts.label ?? 'prompt-hook';

  if (!opts.completeFn) {
    return {
      label,
      status: 1,
      signal: null,
      stderr: 'No completion function provided for prompt hook',
      timedOut: false,
    };
  }

  const prompt = renderTemplate(opts.promptTemplate, opts.payload);

  try {
    const response = await opts.completeFn([{ role: 'user', content: prompt }]);

    if (response) {
      process.stdout.write(response);
    }

    return {
      label,
      status: 0,
      signal: null,
      stderr: '',
      timedOut: false,
    };
  } catch (e) {
    return {
      label,
      status: 1,
      signal: null,
      stderr: e instanceof Error ? e.message : String(e),
      timedOut: false,
    };
  }
}

export { renderTemplate };
