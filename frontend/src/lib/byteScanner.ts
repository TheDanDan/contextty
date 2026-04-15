import type { ChunkType } from '../types';

// Parser states — mirrors the Python _ByteScanner exactly
const ST_PREAMBLE = 'preamble';
const ST_OUTPUT = 'output';
const ST_BETWEEN = 'between';
const ST_STATE = 'state';
const ST_DONE = 'done';

const MODE_RE = /<mode>interactive:([^<]+)<\/mode>/;

interface GeminiChunk {
  text?: string | null;
}

/**
 * Async generator that wraps a Gemini stream and emits typed [ChunkType, string] tuples.
 * Direct TypeScript port of contextty/llm/client.py _ByteScanner.
 *
 * Yields:
 *   ["mode",   "vim"]         — interactive mode tag, emitted once if present
 *   ["output", "some text"]   — text inside <shell_output>…</shell_output>
 *   ["state",  "{...json...}"]— full content of <state>…</state>, emitted once at end
 */
export async function* byteScanner(
  stream: AsyncIterable<GeminiChunk>
): AsyncGenerator<[ChunkType, string]> {
  let state = ST_PREAMBLE;
  let buf = '';
  let outputBuf = '';

  for await (const chunk of stream) {
    const text = chunk.text ?? '';
    if (!text) continue;
    buf += text;

    while (buf.length > 0) {
      if (state === ST_PREAMBLE) {
        const m = MODE_RE.exec(buf);
        if (m) {
          yield ['mode', m[1]];
          buf = buf.slice(m.index + m[0].length);
        }

        const idx = buf.indexOf('<shell_output>');
        if (idx !== -1) {
          buf = buf.slice(idx + '<shell_output>'.length);
          state = ST_OUTPUT;
        } else {
          const keep = Math.max(0, buf.length - '<shell_output>'.length + 1);
          buf = buf.slice(keep);
          break;
        }
      } else if (state === ST_OUTPUT) {
        const idx = buf.indexOf('</shell_output>');
        if (idx !== -1) {
          outputBuf += buf.slice(0, idx);
          if (outputBuf) {
            yield ['output', outputBuf];
            outputBuf = '';
          }
          buf = buf.slice(idx + '</shell_output>'.length);
          state = ST_BETWEEN;
        } else {
          const safe = Math.max(0, buf.length - '</shell_output>'.length + 1);
          if (safe > 0) {
            outputBuf += buf.slice(0, safe);
            if (outputBuf.length >= 8) {
              yield ['output', outputBuf];
              outputBuf = '';
            }
            buf = buf.slice(safe);
          }
          break;
        }
      } else if (state === ST_BETWEEN) {
        const idx = buf.indexOf('<state>');
        if (idx !== -1) {
          buf = buf.slice(idx + '<state>'.length);
          state = ST_STATE;
        } else {
          const keep = Math.max(0, buf.length - '<state>'.length + 1);
          buf = buf.slice(keep);
          break;
        }
      } else if (state === ST_STATE) {
        const idx = buf.indexOf('</state>');
        if (idx !== -1) {
          const stateJson = buf.slice(0, idx).trim();
          yield ['state', stateJson];
          state = ST_DONE;
          buf = buf.slice(idx + '</state>'.length);
        } else {
          break; // accumulate until closing tag
        }
      } else if (state === ST_DONE) {
        break;
      }
    }
  }

  // Flush any remaining output
  if (outputBuf) {
    yield ['output', outputBuf];
  }
}
