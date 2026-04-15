from __future__ import annotations

from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import RichLog


class OutputBuffer(Widget):
    """Scrollable ANSI-aware terminal output area."""

    DEFAULT_CSS = """
    OutputBuffer {
        height: 1fr;
        border: none;
        padding: 0;
    }
    OutputBuffer RichLog {
        height: 1fr;
        border: none;
        padding: 0 1;
        background: $background;
        scrollbar-gutter: stable;
    }
    """

    def compose(self) -> ComposeResult:
        yield RichLog(
            highlight=False,
            markup=False,
            auto_scroll=True,
            wrap=True,
            id="rich-log",
        )

    def _log(self) -> RichLog:
        return self.query_one(RichLog)

    def write_ansi(self, text: str) -> None:
        """Append raw ANSI text to the log."""
        if not text:
            return
        self._log().write(text, animate=False, expand=True)

    def write_line(self, text: str) -> None:
        """Append a plain text line."""
        self._log().write(text + "\n", animate=False, expand=True)

    def clear(self) -> None:
        self._log().clear()
