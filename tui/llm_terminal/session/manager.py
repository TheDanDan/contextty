from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from llm_terminal.llm.client import create_client
from llm_terminal.llm.prompts import SYSTEM_PROMPT
from llm_terminal.session.compressor import maybe_compress
from llm_terminal.session.state import ShellState


class SessionManager:
    """Owns the LLM conversation and shell state machine.

    Callers await `run_command(cmd)` and iterate the returned async generator
    to receive (chunk_type, text) tuples in real time.
    """

    def __init__(self) -> None:
        self._client = create_client()
        self.state = ShellState(
            aliases={"ll": "ls -alF", "la": "ls -A", "l": "ls -CF"}
        )
        self._messages: list[dict] = []

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    async def run_command(
        self, raw_input: str
    ) -> AsyncGenerator[tuple[str, str], None]:
        """Stream (chunk_type, text) for one command turn.

        chunk_type values: "output", "mode", "state", "error"
        """
        # Inject state header + user command
        user_content = f"{self.state.to_header()}\n{raw_input}"
        self._messages.append({"role": "user", "content": user_content})

        full_assistant_text = ""
        state_json: str | None = None
        mode_name: str | None = None

        try:
            async for chunk_type, text in self._client.stream(
                messages=self._messages,
                system=SYSTEM_PROMPT,
            ):
                if chunk_type == "mode":
                    mode_name = text
                    yield ("mode", text)
                elif chunk_type == "output":
                    full_assistant_text += text
                    yield ("output", text)
                elif chunk_type == "state":
                    state_json = text

        except Exception as exc:  # noqa: BLE001
            error_msg = f"\r\n\033[31mllm-terminal error: {exc}\033[0m\r\n"
            full_assistant_text += error_msg
            yield ("error", error_msg)

        # Reconstruct the full assistant message (output + state tags)
        reconstructed = (
            f"<shell_output>{full_assistant_text}</shell_output>\n"
            f"<state>{state_json or '{}'}</state>"
        )
        self._messages.append({"role": "assistant", "content": reconstructed})

        # Update shell state
        if state_json:
            try:
                self.state = ShellState.from_json(state_json, base=self.state)
            except (json.JSONDecodeError, KeyError):
                pass  # keep current state on parse failure

        # Update interactive mode from <mode> tag
        if mode_name:
            self.state.interactive_mode = True
            self.state.interactive_program = mode_name
        elif raw_input in ("exit", "exit()", "quit", "quit()", ":q", ":q!", ":wq", ":wq!", "q"):
            self.state.interactive_mode = False
            self.state.interactive_program = ""

        # Yield the final state JSON so the TUI can update PS1
        yield ("state_done", state_json or "{}")

        # Run context compression if needed
        self._messages = await maybe_compress(
            self._messages, self.state, self._client.complete
        )

    def clear_screen(self) -> None:
        """No-op here; the TUI handles the visual clear."""
        pass

    @property
    def messages(self) -> list[dict]:
        return self._messages
