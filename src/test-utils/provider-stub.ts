/**
 * Provider stub for unit tests.
 *
 * Replaces `completeChat` / `chatCompletion` in agent-loop and dispatcher tests
 * with a scripted queue of `ProviderResponse`s. Captures every request so tests
 * can assert on the body the loop *would have sent* — including `tools`,
 * `tool_choice`, and the full message history at each turn.
 *
 * Used across Phases 3-9.
 */

import type { ChatMessage } from '../core/providers/openai-compatible.js';
import type {
  ProviderResponse,
  ToolDefinition,
} from '../core/providers/types.js';

export interface CapturedCall {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  maxTokens?: number;
}

export interface ProviderStub {
  /** Append a scripted response to the queue. */
  enqueue(res: ProviderResponse): void;
  /** Convenience: enqueue a plain text response with `stop_reason: 'end_turn'`. */
  enqueueText(content: string): void;
  /** Convenience: enqueue a tool-call response with `stop_reason: 'tool_use'`. */
  enqueueToolCall(name: string, args: Record<string, unknown>, id?: string): void;
  /** All calls observed since construction. */
  calls: CapturedCall[];
  /** The function to inject in place of `completeChat`. */
  complete: (
    messages: ChatMessage[],
    options?: {
      tools?: ToolDefinition[];
      toolChoice?: 'auto' | 'none' | 'required';
      maxTokens?: number;
    },
  ) => Promise<ProviderResponse>;
}

export function createProviderStub(initial: ProviderResponse[] = []): ProviderStub {
  const queue: ProviderResponse[] = [...initial];
  const calls: CapturedCall[] = [];
  let counter = 0;

  const stub: ProviderStub = {
    enqueue(res) {
      queue.push(res);
    },
    enqueueText(content) {
      queue.push({ content, stop_reason: 'end_turn' });
    },
    enqueueToolCall(name, args, id) {
      const callId = id ?? `call_${++counter}`;
      queue.push({
        content: '',
        stop_reason: 'tool_use',
        tool_calls: [
          {
            id: callId,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
    },
    calls,
    async complete(messages, options) {
      calls.push({
        messages: messages.map((m) => structuredClone(m)),
        tools: options?.tools,
        toolChoice: options?.toolChoice,
        maxTokens: options?.maxTokens,
      });
      const next = queue.shift();
      if (!next) {
        throw new Error('ProviderStub: queue empty — enqueue more responses');
      }
      return next;
    },
  };
  return stub;
}
