import { GoogleGenAI } from '@google/genai';
import type { Message, ChunkType } from '../types';
import { byteScanner } from './byteScanner';

function toGeminiContents(messages: Message[]) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : ('user' as 'user' | 'model'),
    parts: [{ text: m.content }],
  }));
}

export class GeminiClient {
  private ai: GoogleGenAI;
  model: string;

  constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async *stream(messages: Message[], system: string): AsyncGenerator<[ChunkType, string]> {
    const contents = toGeminiContents(messages);
    const stream = await this.ai.models.generateContentStream({
      model: this.model,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: 4096,
      },
    });

    let finalUsage: string | null = null;
    async function* usageWrapper() {
      for await (const chunk of stream) {
        if (chunk.usageMetadata) {
          finalUsage = JSON.stringify(chunk.usageMetadata);
        }
        yield chunk;
      }
    }

    yield* byteScanner(usageWrapper());

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
