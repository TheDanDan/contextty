from __future__ import annotations

from textual.app import ComposeResult
from textual.binding import Binding
from textual.message import Message
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Input, Label


class PromptBar(Widget):
    """PS1 label + Input widget with command history and Ctrl+C handling."""

    DEFAULT_CSS = """
    PromptBar {
        height: 1;
        layout: horizontal;
        background: $background;
    }
    PromptBar Label {
        width: auto;
        padding: 0;
        background: $background;
        color: $success;
        text-style: bold;
    }
    PromptBar Input {
        width: 1fr;
        border: none;
        background: $background;
        padding: 0;
        height: 1;
    }
    PromptBar Input:focus {
        border: none;
    }
    """

    BINDINGS = [
        Binding("ctrl+c", "interrupt", "Interrupt", show=False),
        Binding("up", "history_up", "History up", show=False),
        Binding("down", "history_down", "History down", show=False),
    ]

    ps1: reactive[str] = reactive("user@llm-shell:~$ ")
    disabled: reactive[bool] = reactive(False)

    class Submitted(Message):
        def __init__(self, value: str) -> None:
            super().__init__()
            self.value = value

    class Interrupted(Message):
        pass

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._history: list[str] = []
        self._history_idx: int = -1
        self._saved_input: str = ""
        self._continuation_mode: bool = False
        self._continuation_lines: list[str] = []

    def compose(self) -> ComposeResult:
        yield Label(self.ps1, id="ps1-label")
        yield Input(placeholder="", id="prompt-input")

    def on_mount(self) -> None:
        self.query_one(Input).focus()

    def watch_ps1(self, ps1: str) -> None:
        label = self.query_one("#ps1-label", Label)
        label.update(ps1)

    def watch_disabled(self, disabled: bool) -> None:
        inp = self.query_one(Input)
        inp.disabled = disabled
        label = self.query_one("#ps1-label", Label)
        if disabled:
            label.styles.opacity = 0.4
        else:
            label.styles.opacity = 1.0
            inp.focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        event.stop()
        value = event.value
        inp = self.query_one(Input)
        inp.clear()

        if self._continuation_mode:
            if value == "" or (not value.endswith("\\")):
                # End of heredoc or continuation
                self._continuation_lines.append(value)
                full_command = "\n".join(self._continuation_lines)
                self._continuation_mode = False
                self._continuation_lines = []
                self._set_ps1_normal()
                self._add_history(full_command)
                self.post_message(self.Submitted(full_command))
            else:
                self._continuation_lines.append(value.rstrip("\\"))
                # Stay in continuation mode
        else:
            if value.endswith("\\"):
                self._continuation_mode = True
                self._continuation_lines = [value.rstrip("\\")]
                label = self.query_one("#ps1-label", Label)
                label.update("> ")
                return

            if value:
                self._add_history(value)
            self._history_idx = -1
            self.post_message(self.Submitted(value))

    def action_interrupt(self) -> None:
        inp = self.query_one(Input)
        inp.clear()
        self._continuation_mode = False
        self._continuation_lines = []
        self._set_ps1_normal()
        self._history_idx = -1
        self.post_message(self.Interrupted())

    def action_history_up(self) -> None:
        if not self._history:
            return
        inp = self.query_one(Input)
        if self._history_idx == -1:
            self._saved_input = inp.value
            self._history_idx = len(self._history) - 1
        elif self._history_idx > 0:
            self._history_idx -= 1
        inp.value = self._history[self._history_idx]
        inp.cursor_position = len(inp.value)

    def action_history_down(self) -> None:
        if self._history_idx == -1:
            return
        inp = self.query_one(Input)
        if self._history_idx < len(self._history) - 1:
            self._history_idx += 1
            inp.value = self._history[self._history_idx]
        else:
            self._history_idx = -1
            inp.value = self._saved_input
        inp.cursor_position = len(inp.value)

    def set_ps1(self, ps1: str) -> None:
        self.ps1 = ps1

    def _set_ps1_normal(self) -> None:
        label = self.query_one("#ps1-label", Label)
        label.update(self.ps1)

    def _add_history(self, command: str) -> None:
        if command and (not self._history or self._history[-1] != command):
            self._history.append(command)

    def focus_input(self) -> None:
        self.query_one(Input).focus()
