import { GoogleGenAI } from '@google/genai';
import type { Message, ChunkType } from '../types';
import { byteScanner } from './byteScanner';

function extractErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Gemini SDK error message is (or contains) a JSON body like {"error":{"message":"..."}}
  const start = raw.indexOf('{');
  if (start !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(start));
      console.error('Full Gemini API error response:', parsed);
      const errorParsed = JSON.parse(parsed.error.message ?? '{}');
      console.error('Gemini API error details:', errorParsed);
      const msg: string = errorParsed?.error.message ?? parsed?.message ?? '';
      if (msg) return msg;
    } catch {
      // not valid JSON from that point, fall through
    }
  }
  return (
    raw
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? raw
  );
}

function toGeminiContents(messages: Message[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : ('user' as 'user' | 'model'),
    parts: [{ text: m.content }],
  }));
}

export class GeminiClient {
  private ai: GoogleGenAI;
  model: string;

  constructor(apiKey: string, model = 'gemini-2.5-flash-lite') {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async *stream(messages: Message[], system: string): AsyncGenerator<[ChunkType, string]> {
    const contents = toGeminiContents(messages);
    let stream: Awaited<ReturnType<typeof this.ai.models.generateContentStream>>;
    try {
      stream = await this.ai.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: system,
          maxOutputTokens: 4096,
        },
      });
    } catch (err) {
      throw new Error(`Gemini API: ${extractErrorMessage(err)}`);
    }

    let finalUsage: string | null = null;
    async function* usageWrapper() {
      for await (const chunk of stream) {
        if (chunk.usageMetadata) {
          finalUsage = JSON.stringify(chunk.usageMetadata);
        }
        yield chunk;
      }
    }

    try {
      yield* byteScanner(usageWrapper());
    } catch (err) {
      throw new Error(`Gemini stream: ${extractErrorMessage(err)}`);
    }

    if (finalUsage) {
      yield ['usage', finalUsage];
    }
  }

  async complete(messages: Message[], system: string): Promise<{ text: string; usage?: string }> {
    const contents = toGeminiContents(messages);
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: 4096,
      },
    });

    return {
      text: response.text ?? '{}',
      usage: response.usageMetadata ? JSON.stringify(response.usageMetadata) : undefined,
    };
  }
}
