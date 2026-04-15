export interface ShellStateData {
  cwd: string;
  env: Record<string, string>;
  exit_code: number;
  username: string;
  hostname: string;
  aliases: Record<string, string>;
  jobs: string[];
  interactive_mode: boolean;
  interactive_program: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  isTransient?: boolean;
}

export interface OutputEntry {
  id: string;
  text: string;
  html: string;
}

export interface UsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface TokenUsage {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  activeTokens: number;
  estimatedCost: number;
  lastCost: number;
  burnRate: number;
  messageCount: number;
}

export type ChunkType = 'output' | 'state' | 'mode' | 'usage';
