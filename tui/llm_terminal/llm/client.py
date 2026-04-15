from __future__ import annotations

import os
import re
from collections.abc import AsyncGenerator, AsyncIterable
from typing import Literal

import anthropic
from google import genai
from google.genai import types as genai_types

# Chunk types emitted by the byte scanner
ChunkType = Literal["output", "state", "mode"]


def _model_to_provider(model: str) -> str:
    if model.startswith("gemini-"):
        return "gemini"
    if model.startswith("claude-"):
        return "anthropic"
    return "gemini"  # default


def create_client() -> LLMClient | GeminiClient:
    """Return the appropriate client based on LLM_MODEL env var."""
    model = os.environ.get("LLM_MODEL", "gemini-2.5-flash")
    if _model_to_provider(model) == "gemini":
        return GeminiClient()
    return LLMClient()


class LLMClient:
    """Thin async wrapper around the Anthropic streaming API.

    Yields (chunk_type, text) tuples:
      ("mode",   "vim")          — interactive mode tag, emitted once if present
      ("output", "some text")    — text inside <shell_output>…</shell_output>
      ("state",  "{...json...}") — full content of <state>…</state>, emitted once at end
    """

    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self.model = os.environ.get("LLM_MODEL", "claude-sonnet-4-6")

    async def stream(
        self,
        messages: list[dict],
        system: str,
    ) -> AsyncGenerator[tuple[ChunkType, str], None]:
        async with self._client.messages.stream(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=messages,
        ) as stream:
            async for chunk in _ByteScanner(stream.text_stream):
                yield chunk

    async def complete(self, messages: list[dict], system: str) -> str:
        """Non-streaming call for compression/snapshot requests."""
        response = await self._client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=messages,
        )
        return response.content[0].text


class GeminiClient:
    """Async wrapper around the Google Gemini streaming API.

    Same interface as LLMClient — yields (chunk_type, text) tuples.
    """

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        self.model = os.environ.get("LLM_MODEL", "gemini-2.5-flash")

    def _to_gemini_contents(self, messages: list[dict]) -> list[dict]:
        result = []
        for m in messages:
            role = "model" if m["role"] == "assistant" else "user"
            result.append({"role": role, "parts": [{"text": m["content"]}]})
        return result

    async def stream(
        self,
        messages: list[dict],
        system: str,
    ) -> AsyncGenerator[tuple[ChunkType, str], None]:
        contents = self._to_gemini_contents(messages)

        async def _text_stream() -> AsyncGenerator[str, None]:
            async for chunk in await self._client.aio.models.generate_content_stream(
                model=self.model,
                contents=contents,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=4096,
                ),
            ):
                yield chunk.text or ""

        async for chunk in _ByteScanner(_text_stream()):
            yield chunk

    async def complete(self, messages: list[dict], system: str) -> str:
        """Non-streaming call for compression/snapshot requests."""
        contents = self._to_gemini_contents(messages)
        response = await self._client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=4096,
            ),
        )
        return response.text or "{}"


# ---------------------------------------------------------------------------
# Byte scanner: splits the streamed text into typed chunks
# ---------------------------------------------------------------------------

_MODE_RE = re.compile(r"<mode>interactive:([^<]+)</mode>")

# Parser states
_ST_PREAMBLE = "preamble"      # before <shell_output>
_ST_OUTPUT = "output"          # inside <shell_output>
_ST_BETWEEN = "between"        # after </shell_output>, before <state>
_ST_STATE = "state"            # inside <state>
_ST_DONE = "done"


class _ByteScanner:
    """Async generator that wraps a text stream and emits typed chunks.

    We scan the raw text character by character, buffering only the minimum
    needed to detect XML tags. Output between <shell_output> tags is yielded
    immediately so the TUI can render it in real time.

    Accepts any AsyncIterable[str] as input.
    """

    def __init__(self, text_stream: AsyncIterable[str]) -> None:
        self._text_stream = text_stream

    async def __aiter__(self) -> AsyncGenerator[tuple[ChunkType, str], None]:
        state = _ST_PREAMBLE
        buf = ""        # accumulates partial tag text or state content
        output_buf = "" # accumulates output to yield in reasonably-sized chunks

        async for text in self._text_stream:
            buf += text

            while buf:
                if state == _ST_PREAMBLE:
                    # Look for optional <mode>…</mode> tag
                    m = _MODE_RE.search(buf)
                    if m:
                        yield ("mode", m.group(1))
                        buf = buf[m.end():]

                    # Look for <shell_output>
                    idx = buf.find("<shell_output>")
                    if idx != -1:
                        buf = buf[idx + len("<shell_output>"):]
                        state = _ST_OUTPUT
                    else:
                        # Keep the tail in case the tag spans a chunk boundary
                        keep = max(0, len(buf) - len("<shell_output>") + 1)
                        buf = buf[keep:]
                        break

                elif state == _ST_OUTPUT:
                    idx = buf.find("</shell_output>")
                    if idx != -1:
                        output_buf += buf[:idx]
                        if output_buf:
                            yield ("output", output_buf)
                            output_buf = ""
                        buf = buf[idx + len("</shell_output>"):]
                        state = _ST_BETWEEN
                    else:
                        # Yield what we have, keeping enough to detect the closing tag
                        safe = max(0, len(buf) - len("</shell_output>") + 1)
                        if safe:
                            output_buf += buf[:safe]
                            # Yield in chunks for a natural streaming feel
                            if len(output_buf) >= 8:
                                yield ("output", output_buf)
                                output_buf = ""
                            buf = buf[safe:]
                        break

                elif state == _ST_BETWEEN:
                    idx = buf.find("<state>")
                    if idx != -1:
                        buf = buf[idx + len("<state>"):]
                        state = _ST_STATE
                    else:
                        keep = max(0, len(buf) - len("<state>") + 1)
                        buf = buf[keep:]
                        break

                elif state == _ST_STATE:
                    idx = buf.find("</state>")
                    if idx != -1:
                        state_json = buf[:idx].strip()
                        yield ("state", state_json)
                        state = _ST_DONE
                        buf = buf[idx + len("</state>"):]
                    else:
                        break  # accumulate until we see the closing tag

                elif state == _ST_DONE:
                    break

        # Flush any remaining output buffer
        if output_buf:
            yield ("output", output_buf)
