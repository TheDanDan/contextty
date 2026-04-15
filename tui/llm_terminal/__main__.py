import os
import sys


def main() -> None:
    model = os.environ.get("LLM_MODEL", "gemini-2.5-flash")

    if model.startswith("claude-"):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("Error: ANTHROPIC_API_KEY environment variable is not set.", file=sys.stderr)
            sys.exit(1)
    else:
        # Default: Gemini
        if not os.environ.get("GEMINI_API_KEY"):
            print("Error: GEMINI_API_KEY environment variable is not set.", file=sys.stderr)
            sys.exit(1)

    from llm_terminal.app import LLMTerminalApp
    app = LLMTerminalApp()
    app.run()


if __name__ == "__main__":
    main()
