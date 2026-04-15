import { useState, useRef, useCallback } from 'react';
import AnsiToHtml from 'ansi-to-html';
import { SessionManager } from '../lib/sessionManager';
import type { OutputEntry, TokenUsage } from '../types';

const converter = new AnsiToHtml({ escapeXML: true, newline: false });

// LLMs often emit escape sequences as literal text (e.g. "\033[1;34m" or "\x1b[0m")
// rather than the actual ESC character (0x1B). Normalize them before ANSI parsing.
function normalizeAnsi(text: string): string {
  // Convert literal \033, \x1b, \e to actual ESC char
  let normalized = text.replace(/\\(?:033|x1b|e)([[()O])/gi, '\x1b$1');

  // Heuristic: If we see " [1;34m" or similar (missing ESC), add it.
  // Most common sequences start with [ then digits/semicolons and end with 'm'.
  normalized = normalized.replace(/(^|[ \n])\[([0-9;]+m)/g, '$1\x1b[$2');

  return normalized;
}

function ansiToHtml(text: string): string {
  try {
    const normalized = normalizeAnsi(text);
    return converter.toHtml(normalized);
  } catch (err) {
    console.error('ANSI conversion failed:', err);
    const safe = normalizeAnsi(text);
    return safe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

interface UseTerminalOptions {
  session: SessionManager;
}

export function useTerminal({ session }: UseTerminalOptions) {
  const sessionRef = useRef<SessionManager | null>(null);
  sessionRef.current = session;

  const [entries, setEntries] = useState<OutputEntry[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [usage, setUsage] = useState<TokenUsage>(() => session.usage);
  const historyIdxRef = useRef(-1);
  const savedInputRef = useRef('');

  // Derived from session.state — re-render when state updates
  const [ps1, setPs1] = useState(() => session.state.ps1());

  // Tracks the ID of the response entry currently being streamed into
  const streamingEntryIdRef = useRef<string | null>(null);

  const addEntry = useCallback((text: string) => {
    setEntries((prev) => [...prev, { id: crypto.randomUUID(), text, html: ansiToHtml(text) }]);
  }, []);

  // Append raw text to the active streaming entry and re-render its HTML
  const appendToStreamingEntry = useCallback((chunk: string) => {
    const id = streamingEntryIdRef.current;
    if (id) {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === id) {
            const nextText = e.text + chunk;
            return { ...e, text: nextText, html: ansiToHtml(nextText) };
          }
          return e;
        })
      );
    } else {
      const newId = crypto.randomUUID();
      streamingEntryIdRef.current = newId;
      setEntries((prev) => [...prev, { id: newId, text: chunk, html: ansiToHtml(chunk) }]);
    }
  }, []);

  const sendCommand = useCallback(
    async (command: string) => {
      if (isBusy) return;

      const trimmed = command.trim();

      // Handle local "clear" command to avoid round-trip and preserve context
      if (!session.state.interactive_mode && (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls')) {
        setEntries([]);
        if (trimmed && trimmed !== '^C') {
          setHistory((prev) =>
            prev.length === 0 || prev[prev.length - 1] !== trimmed ? [...prev, trimmed] : prev
          );
        }
        return;
      }

      // Echo prompt + command
      const ps1Text = session.state.ps1();
      const promptHtml =
        `<span style="color:#4ec94e;font-weight:bold">${ansiToHtml(ps1Text)}</span>` +
        ansiToHtml(command);

      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: ps1Text + command, html: promptHtml },
      ]);

      // Update command history (skip blank lines and duplicates)
      if (trimmed && trimmed !== '^C') {
        setHistory((prev) =>
          prev.length === 0 || prev[prev.length - 1] !== trimmed ? [...prev, trimmed] : prev
        );
      }

      setIsBusy(true);
      streamingEntryIdRef.current = null;

      try {
        for await (const [chunkType, text] of session.runCommand(command)) {
          if (chunkType === 'output') {
            // Handle clear-screen sequence
            if (text.includes('\x1b[2J\x1b[H')) {
              streamingEntryIdRef.current = null;
              setEntries([]);
              // eslint-disable-next-line no-control-regex
              const remaining = text.replace(/\x1b\[2J\x1b\[H/g, '');
              if (remaining) appendToStreamingEntry(remaining);
            } else {
              appendToStreamingEntry(text);
            }
          } else if (chunkType === 'error') {
            streamingEntryIdRef.current = null;
            addEntry(text);
          } else if (chunkType === 'state_done') {
            setPs1(session.state.ps1());
          } else if (chunkType === 'usage') {
            setUsage(JSON.parse(text));
          }
        }
      } catch (err) {
        streamingEntryIdRef.current = null;
        addEntry(`\x1b[31mError: ${String(err)}\x1b[0m\r\n`);
      } finally {
        streamingEntryIdRef.current = null;
        setIsBusy(false);
        setPs1(session.state.ps1());
      }
    },
    [isBusy, session, addEntry, appendToStreamingEntry]
  );

  const resetSession = useCallback(() => {
    session.reset();
    setEntries([]);
    setUsage(session.usage);
    setPs1(session.state.ps1());
    historyIdxRef.current = -1;
  }, [session]);

  return {
    entries,
    isBusy,
    history,
    ps1,
    usage,
    historyIdxRef,
    savedInputRef,
    sendCommand,
    resetSession,
  };
}
