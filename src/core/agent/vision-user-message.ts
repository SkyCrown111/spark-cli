import type { ChatMessage } from '../providers/openai-compatible.js';
import type { VisualInputContext } from '../vision/visual-context.js';

/** Build a user message for the agent loop, optionally with vision input. */
export function buildAgentUserMessage(text: string, visual?: VisualInputContext): ChatMessage {
  if (visual?.imageDataUrl) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: [visual.summary, text].filter(Boolean).join('\n\n') },
        { type: 'image_url', image_url: { url: visual.imageDataUrl } },
      ],
    };
  }
  if (visual?.summary) {
    return {
      role: 'user',
      content: `${visual.summary}\n\n${text}`,
    };
  }
  return { role: 'user', content: text };
}
