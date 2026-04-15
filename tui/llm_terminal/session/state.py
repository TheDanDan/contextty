from __future__ import annotations

import json
from dataclasses import dataclass, field


@dataclass
class ShellState:
    cwd: str = "/home/user"
    env: dict[str, str] = field(default_factory=dict)
    exit_code: int = 0
    username: str = "user"
    hostname: str = "llm-shell"
    aliases: dict[str, str] = field(default_factory=dict)
    jobs: list[str] = field(default_factory=list)
    interactive_mode: bool = False
    interactive_program: str = ""

    # ------------------------------------------------------------------ #
    # Serialization                                                        #
    # ------------------------------------------------------------------ #

    def to_json(self) -> str:
        return json.dumps({
            "cwd": self.cwd,
            "env": self.env,
            "exit_code": self.exit_code,
            "aliases": self.aliases,
            "jobs": self.jobs,
        }, separators=(",", ":"))

    @classmethod
    def from_json(cls, data: str | dict, base: ShellState | None = None) -> ShellState:
        if isinstance(data, str):
            parsed = json.loads(data)
        else:
            parsed = data

        source = base or cls()
        return cls(
            cwd=parsed.get("cwd", source.cwd),
            env=parsed.get("env", source.env),
            exit_code=parsed.get("exit_code", source.exit_code),
            username=source.username,
            hostname=source.hostname,
            aliases=parsed.get("aliases", source.aliases),
            jobs=parsed.get("jobs", source.jobs),
            interactive_mode=source.interactive_mode,
            interactive_program=source.interactive_program,
        )

    # ------------------------------------------------------------------ #
    # Prompt injection header                                              #
    # ------------------------------------------------------------------ #

    def to_header(self) -> str:
        """Compact one-liner injected at the top of every user message."""
        parts = [f"cwd={self.cwd}", f"exit_code={self.exit_code}"]
        if self.env:
            parts.append(f"env={json.dumps(self.env, separators=(',', ':'))}")
        if self.aliases:
            parts.append(f"aliases={json.dumps(self.aliases, separators=(',', ':'))}")
        if self.jobs:
            parts.append(f"jobs={json.dumps(self.jobs)}")
        return "[SHELL STATE " + " ".join(parts) + "]"

    # ------------------------------------------------------------------ #
    # Display helpers                                                      #
    # ------------------------------------------------------------------ #

    def ps1(self) -> str:
        """Rendered PS1 prompt string."""
        home = f"/home/{self.username}"
        display_cwd = self.cwd.replace(home, "~", 1)
        return f"{self.username}@{self.hostname}:{display_cwd}$ "
