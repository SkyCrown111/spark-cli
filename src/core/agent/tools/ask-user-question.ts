/**
 * ask_user_question: surface a multiple-choice question to the human.
 *
 * - Only available when the caller wires `ctx.askUser` (REPL does this; the
 *   one-shot `chat` command does not).
 * - Schema mirrors Claude Code's structured-question shape: `questions[]` with
 *   `options[]`, optional `multiSelect`. Free-text input is intentionally not
 *   exposed — agents should fall back to plain prose if they need that.
 */

import type { RegisteredTool, ToolContext, ToolResult } from '../tool-registry.js';
import type { AskUserQuestion } from '../tool-permissions.js';

function parseQuestions(raw: unknown): { ok: true; questions: AskUserQuestion[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, reason: '`questions` must be a non-empty array' };
  }
  if (raw.length > 4) {
    return { ok: false, reason: '`questions` accepts up to 4 entries' };
  }
  const out: AskUserQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown> | undefined;
    if (!q || typeof q !== 'object') {
      return { ok: false, reason: `questions[${i}] must be an object` };
    }
    if (typeof q.question !== 'string' || q.question.trim().length === 0) {
      return { ok: false, reason: `questions[${i}].question is required` };
    }
    const options = q.options;
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
      return { ok: false, reason: `questions[${i}].options must have 2-4 entries` };
    }
    const opts: AskUserQuestion['options'] = [];
    for (let j = 0; j < options.length; j++) {
      const o = options[j] as Record<string, unknown> | undefined;
      if (!o || typeof o.label !== 'string' || o.label.length === 0) {
        return { ok: false, reason: `questions[${i}].options[${j}].label is required` };
      }
      opts.push({
        label: o.label,
        description: typeof o.description === 'string' ? o.description : undefined,
      });
    }
    out.push({
      question: q.question,
      header: typeof q.header === 'string' ? q.header.slice(0, 12) : undefined,
      options: opts,
      multiSelect: q.multiSelect === true,
    });
  }
  return { ok: true, questions: out };
}

async function handler(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!ctx.askUser) {
    return {
      content:
        'ask_user_question is only available in the interactive REPL. ' +
        'Either re-run inside `spark-cli` (no subcommand) or rephrase the question as plain prose.',
      isError: true,
    };
  }
  const parsed = parseQuestions(args.questions);
  if (!parsed.ok) {
    return { content: `ask_user_question: ${parsed.reason}`, isError: true };
  }

  const result = await ctx.askUser({ questions: parsed.questions });
  if ('unsupported' in result) {
    return { content: `ask_user_question: ${result.reason}`, isError: true };
  }

  const lines = ['User answered:'];
  for (const a of result.answers) {
    lines.push(`- ${a.question}: ${a.selected.join(', ') || '(skipped)'}`);
  }
  return {
    content: lines.join('\n'),
    structured: { answers: result.answers },
  };
}

export const askUserQuestionTool: RegisteredTool = {
  name: 'ask_user_question',
  description:
    'Ask the human up to 4 multiple-choice questions and wait for the answers. Use this when an approach is genuinely ambiguous and you cannot proceed without a decision. Each question has 2-4 options. Returns the selected labels.',
  planModeAllowed: true,
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The full question.' },
            header: {
              type: 'string',
              description: 'Short chip label, max 12 characters.',
            },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['label'],
                additionalProperties: false,
              },
            },
            multiSelect: { type: 'boolean' },
          },
          required: ['question', 'options'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  },
  handler,
};
