import type { Message } from '../types';
import type { ShellState } from './shellState';
import { COMPRESSION_SUMMARY_PROMPT, FILESYSTEM_SNAPSHOT_PROMPT, SYSTEM_PROMPT } from './prompts';

// Rough token estimate: 1 token ≈ 4 chars
export function estimateTokens(messages: Message[]): number {
  let total = SYSTEM_PROMPT.length / 4;
  for (const msg of messages) {
    total += msg.content.length / 4;
  }
  return Math.floor(total);
}

// Context window limits — same as Python version
const SOFT_LIMIT = 100_000; // 50% — compress early while state is still fresh
const HARD_LIMIT = 180_000; // 90% — full snapshot reset

type LLMComplete = (
  messages: Message[],
  system: string
) => Promise<{ text: string; usage?: string }>;

export async function maybeCompress(
  messages: Message[],
  state: ShellState,
  llmComplete: LLMComplete
): Promise<Message[]> {
  const tokens = estimateTokens(messages);
  if (tokens < SOFT_LIMIT) return messages;
  if (tokens >= HARD_LIMIT) return hardReset(messages, state, llmComplete);
  return softCompress(messages, state, llmComplete);
}

function flatten(messages: Message[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
}

/** Merge synthetic prepended message to avoid adjacent user messages (Gemini requirement). */
function prependSynthetic(synthetic: Message, recent: Message[]): Message[] {
  if (recent.length > 0 && recent[0].role === 'user') {
    const merged: Message = {
      role: 'user',
      content: synthetic.content + '\n\n' + recent[0].content,
    };
    return [merged, ...recent.slice(1)];
  }
  return [synthetic, ...recent];
}

async function softCompress(
  messages: Message[],
  _state: ShellState,
  llmComplete: LLMComplete
): Promise<Message[]> {
  const keepTail = 5;
  if (messages.length <= keepTail) return messages;

  const old = messages.slice(0, -keepTail);
  const recent = messages.slice(-keepTail);

  let summaryText: string;
  try {
    const result = await llmComplete(
      [{ role: 'user', content: COMPRESSION_SUMMARY_PROMPT + '\n\n' + flatten(old) }],
      'You are a precise summarizer. Output only valid JSON.'
    );
    summaryText = result.text;
  } catch {
    summaryText = '{"note":"summary unavailable"}';
  }

  let summary: unknown;
  try {
    summary = JSON.parse(summaryText.trim());
  } catch {
    summary = { note: 'summary unavailable' };
  }

  const synthetic: Message = {
    role: 'user',
    content: `[SESSION HISTORY SUMMARY]\n${JSON.stringify(summary, null, 2)}\n[END SUMMARY]`,
  };

  return prependSynthetic(synthetic, recent);
}

async function hardReset(
  messages: Message[],
  _state: ShellState,
  llmComplete: LLMComplete
): Promise<Message[]> {
  const keepTail = 3;
  const recent = messages.length > keepTail ? messages.slice(-keepTail) : [...messages];

  let snapshotText: string;
  try {
    const result = await llmComplete(
      [...messages, { role: 'user', content: FILESYSTEM_SNAPSHOT_PROMPT }],
      SYSTEM_PROMPT
    );
    snapshotText = result.text;
  } catch {
    snapshotText = '{"raw":"snapshot unavailable"}';
  }

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(snapshotText.trim());
  } catch {
    snapshot = { raw: snapshotText.slice(0, 2000) };
  }

  const synthetic: Message = {
    role: 'user',
    content: `[FULL SESSION SNAPSHOT]\n${JSON.stringify(snapshot, null, 2)}\n[END SNAPSHOT]`,
  };

  return prependSynthetic(synthetic, recent);
}
