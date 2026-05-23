/**
 * Auto-extraction of durable facts from conversation turns.
 *
 * After a turn completes, this module sends a lightweight LLM prompt to
 * extract 0-3 facts worth persisting. Extracted facts are saved via
 * `saveMemory()` to the cross-session store.
 *
 * Design:
 * - The extraction prompt is short (under 1KB) to minimize cost.
 * - The LLM returns a JSON array; we parse and validate it.
 * - Duplicate detection: skip facts whose name already exists in the store.
 * - Max 3 facts per turn to avoid noise.
 */

import type { ChatMessage } from '../providers/openai-compatible.js';
import type { CompletionFn } from '../agent/agent-loop.js';
import { saveMemory, listMemories, type MemoryType } from './cross-session-store.js';

export interface ExtractedFact {
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}

const EXTRACTION_SYSTEM = `You are a fact extractor. Read the conversation and extract 0-3 durable facts worth remembering across sessions.

A "durable fact" is something that would be useful in future conversations:
- User preferences, role, expertise, or workflow style (type: "user")
- Corrections the user made or validated approaches (type: "feedback")
- Ongoing project decisions, constraints, or context (type: "project")
- External system references, URLs, tool names (type: "reference")

Do NOT extract:
- Transient task details that will be obsolete soon
- Code snippets or file contents (use tools to re-read)
- Greetings or pleasantries

Return a JSON array. Each element: {"name": "snake_case_id", "description": "one-line hook", "type": "user|feedback|project|reference", "body": "the fact in 1-3 sentences with **Why:** and **How to apply:** for feedback/project types"}

If no facts are worth extracting, return an empty array: []
Return ONLY the JSON array, no other text.`;

const MAX_FACTS_PER_TURN = 3;

/**
 * Extract durable facts from a conversation turn and save them to the
 * cross-session memory store.
 *
 * @param projectRoot - Project root for memory storage
 * @param history - Full conversation history (including the latest turn)
 * @param completeFn - LLM completion function
 * @returns Array of saved facts (empty if none extracted)
 */
export async function extractMemoryFacts(
  projectRoot: string,
  history: ChatMessage[],
  completeFn: CompletionFn,
): Promise<ExtractedFact[]> {
  // Build a compact transcript from the last few messages
  const recentMessages = history.slice(-8);
  const transcript = renderTranscriptForExtraction(recentMessages);
  if (!transcript.trim()) return [];

  let response: string;
  try {
    const res = await completeFn(
      [
        { role: 'system', content: EXTRACTION_SYSTEM },
        {
          role: 'user',
          content: `Extract durable facts from this conversation:\n\n${transcript}`,
        },
      ],
      { maxTokens: 1024 },
    );
    response = (res.content ?? '').trim();
  } catch {
    // LLM call failures are non-critical for auto-extraction
    return [];
  }

  if (!response) return [];

  // Parse the JSON array from the response
  const facts = parseExtractedFacts(response);
  if (facts.length === 0) return [];

  // Deduplicate against existing memories
  const existing = listMemories(projectRoot);
  const existingNames = new Set(existing.map((m) => m.name));

  const saved: ExtractedFact[] = [];
  for (const fact of facts.slice(0, MAX_FACTS_PER_TURN)) {
    if (existingNames.has(fact.name)) continue;
    try {
      saveMemory(projectRoot, fact);
      saved.push(fact);
    } catch {
      // Save failures are non-critical
    }
  }
  return saved;
}

function renderTranscriptForExtraction(messages: ChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const content = typeof m.content === 'string' ? m.content : '';
    if (m.role === 'tool') {
      // Truncate tool results
      const truncated = content.length > 300 ? content.slice(0, 300) + '…' : content;
      lines.push(`[tool result]: ${truncated}`);
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const calls = m.tool_calls.map((t) => t.function.name).join(', ');
      const text = content ? ` ${content.slice(0, 200)}` : '';
      lines.push(`[assistant called: ${calls}]${text}`);
      continue;
    }
    if (content) {
      const truncated = content.length > 500 ? content.slice(0, 500) + '…' : content;
      lines.push(`[${m.role}]: ${truncated}`);
    }
  }
  return lines.join('\n');
}

function parseExtractedFacts(response: string): ExtractedFact[] {
  // Try to extract JSON array from the response
  let jsonStr = response;

  // If response contains markdown code blocks, extract the JSON
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1]!.trim();
  }

  // Find the first [ and last ]
  const start = jsonStr.indexOf('[');
  const end = jsonStr.lastIndexOf(']');
  if (start < 0 || end < 0 || end <= start) return [];

  try {
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];

    const validTypes: MemoryType[] = ['user', 'feedback', 'project', 'reference'];
    const facts: ExtractedFact[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.name !== 'string' || !item.name.trim()) continue;
      if (typeof item.description !== 'string' || !item.description.trim()) continue;
      if (typeof item.body !== 'string' || !item.body.trim()) continue;
      const type = validTypes.includes(item.type) ? (item.type as MemoryType) : 'project';
      facts.push({
        name: item.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .slice(0, 60),
        description: item.description.trim().slice(0, 200),
        type,
        body: item.body.trim(),
      });
    }
    return facts;
  } catch {
    return [];
  }
}
