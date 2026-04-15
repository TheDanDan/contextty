from __future__ import annotations

import re
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.message import Message
from textual.worker import Worker, WorkerState

from llm_terminal.session.manager import SessionManager
from llm_terminal.widgets.output_buffer import OutputBuffer
from llm_terminal.widgets.prompt_bar import PromptBar

# Strip ANSI escape codes for the clear-screen detector
_ANSI_RE = re.compile(r"\033\[[0-9;]*[A-Za-z]")
_CLEAR_SEQ = "\033[2J\033[H"


class _TextChunk(Message):
    def __init__(self, chunk_type: str, text: str) -> None:
        super().__init__()
        self.chunk_type = chunk_type
        self.text = text


class LLMTerminalApp(App):
    """The LLM-backed terminal application."""

    CSS = """
    Screen {
        layout: vertical;
        background: #1e1e1e;
    }
    OutputBuffer {
        height: 1fr;
    }
    PromptBar {
        dock: bottom;
        height: 1;
        background: #1e1e1e;
    }
    """

    BINDINGS = [
        Binding("ctrl+q", "quit", "Quit", show=True),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._session = SessionManager()
        self._current_worker: Worker | None = None

    def compose(self) -> ComposeResult:
        yield OutputBuffer(id="output")
        yield PromptBar(id="prompt")

    def on_mount(self) -> None:
        prompt = self.query_one(PromptBar)
        prompt.set_ps1(self._session.state.ps1())
        self._write(
            "\033[1;32m"
            "╔══════════════════════════════════════╗\r\n"
            "║        LLM Terminal  v0.1.0          ║\r\n"
            "║  Ctrl+Q to quit                      ║\r\n"
            "╚══════════════════════════════════════╝"
            "\033[0m\r\n"
        )

    # ------------------------------------------------------------------ #
    # Event handlers                                                       #
    # ------------------------------------------------------------------ #

    def on_prompt_bar_submitted(self, event: PromptBar.Submitted) -> None:
        command = event.value

        # Echo prompt + command to output
        ps1 = self._session.state.ps1()
        self._write(f"\033[1;32m{ps1}\033[0m{command}\r\n")

        if not command.strip():
            return

        self._set_busy(True)
        self._current_worker = self.run_worker(
            self._stream_command(command),
            exclusive=True,
            thread=False,
        )

    def on_prompt_bar_interrupted(self, event: PromptBar.Interrupted) -> None:
        if self._current_worker and self._current_worker.state == WorkerState.RUNNING:
            self._current_worker.cancel()

        # Send ^C to the LLM so it can update state
        self._write("\033[1;32m" + self._session.state.ps1() + "\033[0m^C\r\n")
        self._set_busy(True)
        self._current_worker = self.run_worker(
            self._stream_command("^C"),
            exclusive=True,
            thread=False,
        )

    def on__text_chunk(self, event: _TextChunk) -> None:
        buf = self.query_one(OutputBuffer)

        if event.chunk_type == "output":
            # Detect clear screen sequence
            if _CLEAR_SEQ in event.text:
                buf.clear()
                remaining = event.text.replace(_CLEAR_SEQ, "")
                if remaining:
                    buf.write_ansi(remaining)
            else:
                buf.write_ansi(event.text)

        elif event.chunk_type in ("state_done",):
            # Update PS1 after state is fully received
            prompt = self.query_one(PromptBar)
            prompt.set_ps1(self._session.state.ps1())
            self._set_busy(False)

        elif event.chunk_type == "error":
            buf.write_ansi(event.text)

        elif event.chunk_type == "mode":
            # Entering interactive mode — nothing visual needed here,
            # the initial screen render comes through "output" chunks
            pass

    def on_worker_state_changed(self, event: Worker.StateChanged) -> None:
        if event.state in (WorkerState.CANCELLED, WorkerState.ERROR):
            self._set_busy(False)

    # ------------------------------------------------------------------ #
    # Async worker                                                         #
    # ------------------------------------------------------------------ #

    async def _stream_command(self, command: str) -> None:
        async for chunk_type, text in self._session.run_command(command):
            self.post_message(_TextChunk(chunk_type, text))

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    def _write(self, text: str) -> None:
        self.query_one(OutputBuffer).write_ansi(text)

    def _set_busy(self, busy: bool) -> None:
        prompt = self.query_one(PromptBar)
        prompt.disabled = busy
        if not busy:
            prompt.focus_input()
