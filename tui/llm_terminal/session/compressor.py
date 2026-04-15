from __future__ import annotations

import json

from llm_terminal.llm.prompts import (
    COMPRESSION_SUMMARY_PROMPT,
    FILESYSTEM_SNAPSHOT_PROMPT,
    SYSTEM_PROMPT,
)
from llm_terminal.session.state import ShellState


# Rough token estimate: 1 token ≈ 4 chars
def _estimate_tokens(messages: list[dict]) -> int:
    total = len(SYSTEM_PROMPT) // 4
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total += len(content) // 4
        elif isinstance(content, list):
            for block in content:
                total += len(str(block)) // 4
    return total


# Context window is 200k tokens; we act at 80% and 90%
_SOFT_LIMIT = 160_000   # 80% — sliding window + summary
_HARD_LIMIT = 180_000   # 90% — full snapshot reset


async def maybe_compress(
    messages: list[dict],
    state: ShellState,
    llm_complete,  # callable: (messages, system) -> str
) -> list[dict]:
    """Return a (possibly compressed) copy of the messages list."""
    tokens = _estimate_tokens(messages)

    if tokens < _SOFT_LIMIT:
        return messages

    if tokens >= _HARD_LIMIT:
        return await _hard_reset(messages, state, llm_complete)

    return await _soft_compress(messages, state, llm_complete)


async def _soft_compress(
    messages: list[dict],
    state: ShellState,
    llm_complete,
) -> list[dict]:
    """Summarize old turns, keep last 20 verbatim."""
    keep_tail = 20
    if len(messages) <= keep_tail:
        return messages

    old = messages[:-keep_tail]
    recent = messages[-keep_tail:]

    summary_text = await llm_complete(
        messages=[
            {"role": "user", "content": COMPRESSION_SUMMARY_PROMPT + "\n\n" + _flatten(old)}
        ],
        system="You are a precise summarizer. Output only valid JSON.",
    )

    try:
        summary = json.loads(summary_text.strip())
    except json.JSONDecodeError:
        # If parsing fails, just drop old messages to save context
        summary = {"note": "summary unavailable"}

    synthetic = {
        "role": "user",
        "content": f"[SESSION HISTORY SUMMARY]\n{json.dumps(summary, indent=2)}\n[END SUMMARY]",
    }

    return [synthetic] + recent


async def _hard_reset(
    messages: list[dict],
    state: ShellState,
    llm_complete,
) -> list[dict]:
    """Full filesystem snapshot, wipe history, keep last 5 turns."""
    keep_tail = 5
    recent = messages[-keep_tail:] if len(messages) > keep_tail else messages

    snapshot_text = await llm_complete(
        messages=messages + [
            {"role": "user", "content": FILESYSTEM_SNAPSHOT_PROMPT}
        ],
        system=SYSTEM_PROMPT,
    )

    try:
        snapshot = json.loads(snapshot_text.strip())
    except json.JSONDecodeError:
        snapshot = {"raw": snapshot_text[:2000]}

    synthetic = {
        "role": "user",
        "content": f"[FULL SESSION SNAPSHOT]\n{json.dumps(snapshot, indent=2)}\n[END SNAPSHOT]",
    }

    return [synthetic] + recent


def _flatten(messages: list[dict]) -> str:
    parts = []
    for msg in messages:
        role = msg.get("role", "?")
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(str(b) for b in content)
        parts.append(f"{role.upper()}: {content}")
    return "\n\n".join(parts)
