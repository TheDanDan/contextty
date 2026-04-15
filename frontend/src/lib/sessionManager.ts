import { ShellState } from './shellState';
import { maybeCompress, estimateTokens } from './compressor';
import { SYSTEM_PROMPT } from './prompts';
import type { Message, TokenUsage, UsageMetadata, ChunkType } from '../types';

export interface LLMClient {
  model: string;
  stream(messages: Message[], system: string): AsyncGenerator<[ChunkType, string]>;
  complete(messages: Message[], system: string): Promise<{ text: string; usage?: string }>;
}

const COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3 / 1e6, output: 2.5 / 1e6 },
  'gemini-2.5-pro': { input: 1.25 / 1e6, output: 10.0 / 1e6 },
};

const DEFAULT_COST = { input: 0.3 / 1e6, output: 2.5 / 1e6 };
const TRUNCATE_LIMIT = 5000;
const MAX_TRANSIENT_TURNS = 3;

export class SessionManager {
  private client: LLMClient;
  state: ShellState;
  private messages: Message[];
  usage: TokenUsage;
  private messageCount: number;

  constructor(client: LLMClient) {
    this.client = client;
    this.state = new ShellState();
    this.messages = [];
    this.usage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      activeTokens: 0,
      estimatedCost: 0,
      lastCost: 0,
      burnRate: 0,
      messageCount: 0,
    };
    this.messageCount = 0;
  }

  async *runCommand(rawInput: string): AsyncGenerator<[string, string]> {
    const isTransient = !this.state.interactive_mode && this.isCommandTransient(rawInput);

    const userContent = `${this.state.toHeader()}\n${rawInput}`;
    this.messages.push({ role: 'user', content: userContent, isTransient });
    this.messageCount++;
    this.usage.messageCount = this.messageCount;

    let fullAssistantText = '';
    let stateJson: string | null = null;
    let modeName: string | null = null;

    try {
      for await (const [chunkType, text] of this.client.stream(this.messages, SYSTEM_PROMPT)) {
        if (chunkType === 'mode') {
          modeName = text;
          yield ['mode', text];
        } else if (chunkType === 'output') {
          fullAssistantText += text;
          yield ['output', text];
        } else if (chunkType === 'state') {
          stateJson = text;
        } else if (chunkType === 'usage') {
          this.updateUsage(JSON.parse(text));
          yield ['usage', JSON.stringify(this.usage)];
        }
      }
    } catch (err) {
      const errorMsg = `\r\n\x1b[31mcontextty error: ${String(err)}\x1b[0m\r\n`;
      fullAssistantText += errorMsg;
      yield ['error', errorMsg];
    }

    // Reconstruct assistant message with XML tags (same format as Python version)
    let storageAssistantText = fullAssistantText;
    if (isTransient && storageAssistantText.length > TRUNCATE_LIMIT) {
      storageAssistantText =
        storageAssistantText.slice(0, TRUNCATE_LIMIT) + '\n\n[Output truncated to save context...]';
    }

    const reconstructed =
      `<shell_output>${storageAssistantText}</shell_output>\n` +
      `<state>${stateJson ?? '{}'}</state>`;
    this.messages.push({ role: 'assistant', content: reconstructed, isTransient });

    // Update shell state from returned JSON
    if (stateJson) {
      try {
        this.state = ShellState.fromJson(stateJson, this.state);
      } catch {
        // keep current state on parse failure
      }
    }

    // Update interactive mode from <mode> tag
    if (modeName) {
      this.state.interactive_mode = true;
      this.state.interactive_program = modeName;
    } else if (
      ['exit', 'exit()', 'quit', 'quit()', ':q', ':q!', ':wq', ':wq!', 'q'].includes(
        rawInput.trim()
      )
    ) {
      this.state.interactive_mode = false;
      this.state.interactive_program = '';
    }

    // Yield final state so the UI can update PS1
    yield ['state_done', stateJson ?? '{}'];

    // Prune old transient messages to keep context lean before potentially compressing
    this.pruneTransientMessages();

    // Run context compression if needed
    this.messages = await maybeCompress(this.messages, this.state, (msgs, sys) =>
      this.client.complete(msgs, sys)
    );

    // Final estimation to ensure UI reflects the reduced context size immediately after compression/pruning
    this.usage.activeTokens = estimateTokens(this.messages);
    yield ['usage', JSON.stringify(this.usage)];
  }

  reset(): void {
    this.state = new ShellState();
    this.messages = [];
    this.usage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      activeTokens: 0,
      estimatedCost: 0,
      lastCost: 0,
      burnRate: 0,
      messageCount: 0,
    };
    this.messageCount = 0;
  }

  private updateUsage(metadata: UsageMetadata) {
    this.usage.totalPromptTokens += metadata.promptTokenCount;
    this.usage.totalCompletionTokens += metadata.candidatesTokenCount;
    this.usage.totalTokens += metadata.totalTokenCount;
    this.usage.activeTokens = metadata.totalTokenCount;

    const rates = COSTS[this.client.model] || DEFAULT_COST;
    const currentCost =
      metadata.promptTokenCount * rates.input + metadata.candidatesTokenCount * rates.output;

    this.usage.estimatedCost += currentCost;
    this.usage.lastCost = currentCost;
    this.usage.burnRate = this.messageCount > 0 ? this.usage.estimatedCost / this.messageCount : 0;
  }

  private isCommandTransient(rawInput: string): boolean {
    const trimmed = rawInput.trim();
    if (trimmed.includes('>') || trimmed.includes('>>')) return false;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];

    // Special case for git subcommands
    if (cmd === 'git') {
      const subcmd = parts[1];
      const gitTransient = ['status', 'log', 'diff', 'show', 'branch', 'remote'];
      return gitTransient.includes(subcmd);
    }

    const transient = [
      'ls',
      'pwd',
      'cat',
      'grep',
      'find',
      'du',
      'df',
      'file',
      'which',
      'env',
      'printenv',
      'echo',
      'stat',
      'lsof',
      'ps',
      'top',
      'free',
      'history',
      'type',
      'man',
      'help',
      'head',
      'tail',
      'more',
      'less',
    ];

    return transient.includes(cmd);
  }

  private pruneTransientMessages() {
    const transientPairsIndices: number[] = [];

    // Find indices of transient assistant messages
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].isTransient && this.messages[i].role === 'assistant') {
        transientPairsIndices.push(i);
      }
    }

    if (transientPairsIndices.length > MAX_TRANSIENT_TURNS) {
      const numToRemove = transientPairsIndices.length - MAX_TRANSIENT_TURNS;
      const indicesToRemove = new Set<number>();

      for (let j = 0; j < numToRemove; j++) {
        const assistantIdx = transientPairsIndices[j];
        indicesToRemove.add(assistantIdx);
        if (assistantIdx > 0 && this.messages[assistantIdx - 1].role === 'user') {
          indicesToRemove.add(assistantIdx - 1);
        }
      }

      this.messages = this.messages.filter((_, idx) => !indicesToRemove.has(idx));
    }
  }
}
