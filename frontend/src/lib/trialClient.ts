import type { Message, ChunkType } from '../types';
import { byteScanner } from './byteScanner';
import { getIdToken } from './firebaseAuth';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080';

// Each SSE data value is a JSON object `{"t": "...text..."}` for normal chunks,
// or the sentinel strings "[DONE]" and "[ERROR] reason" for control messages.
interface SSEChunk {
  t: string;
}

// Reads the SSE response body and yields objects matching byteScanner's input type.
async function* sseToTextStream(response: Response): AsyncIterable<{ text?: string | null }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are delimited by double newlines.
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        if (data === '[DONE]') return;
        if (data.startsWith('[ERROR]')) {
          const reason = data.slice(8).trim();
          if (reason === 'trial_limit_exceeded') {
            throw new Error('trial_limit_exceeded');
          }
          throw new Error(`backend_error: ${reason}`);
        }

        const obj = JSON.parse(data) as SSEChunk;
        yield { text: obj.t };
      }
    }
  }
}

export class TrialClient {
  model: string;

  constructor(model = 'gemini-2.5-flash') {
    this.model = model;
  }

  async *stream(messages: Message[], system: string): AsyncGenerator<[ChunkType, string]> {
    void system; // backend always uses hardcoded SYSTEM_PROMPT — client-sent system is ignored
    const idToken = await getIdToken();
    if (!idToken) {
      throw new Error('not_authenticated');
    }

    const response = await fetch(`${BACKEND_URL}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        model: this.model,
      }),
    });

    if (response.status === 402) {
      throw new Error('trial_limit_exceeded');
    }
    if (response.status === 401) {
      throw new Error('not_authenticated');
    }
    if (!response.ok) {
      throw new Error(`backend_error_${response.status}`);
    }

    yield* byteScanner(sseToTextStream(response));
  }

  // Context compression (complete()) is not used in trial mode — the 10 msg/day
  // limit means token counts never approach the 160k compression threshold.
  async complete(
    messages: Message[],
    system: string
  ): Promise<{ text: string; usage?: string }> {
    void messages;
    void system;
    return { text: '{}' };
  }
}
