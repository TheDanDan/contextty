# LLM Terminal

A stateful Unix shell emulator that runs entirely in your browser, powered by Google Gemini AI.

Type real bash commands and get realistic terminal output — with persistent filesystem state, ANSI colors, pipes, redirects, interactive programs (vim, python REPL, etc.), and background jobs.

## Architecture

This is a **fully client-side React SPA**. All Gemini API calls are made directly from your browser using the `@google/genai` JavaScript SDK. Your API key is stored in `localStorage` and never sent to any server.

```
Browser  ──→  Google Gemini API
   ↕
localStorage (API key only)
```

No backend. No proxy. No server to run.

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **A Gemini API key** — free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), enter your API key, and start typing.

## Usage

Type any bash command at the prompt. The AI emulates a full Ubuntu 22.04 environment with persistent state across commands.

| Key | Action |
|-----|--------|
| `Enter` | Run command |
| `↑` / `↓` | Navigate command history |
| `Ctrl+C` | Interrupt current command |
| `Ctrl+L` | Clear screen |

The **reset** button wipes conversation history and starts a fresh shell session.  
The **change key** button returns to the API key input screen.

## Model Selection

Choose your model on the key input screen:

| Model | Best for |
|-------|----------|
| `gemini-2.5-flash` | Fast responses, lower cost — good for most use |
| `gemini-2.5-pro` | More accurate, better at complex tasks |

You can switch models by clicking **change key** and re-entering your key with a different model selection.

## Production Build

```bash
cd frontend
npm run build
```

The `frontend/dist/` directory contains a static site you can host anywhere:

- **GitHub Pages** — push `dist/` to a `gh-pages` branch
- **Netlify / Vercel** — connect the repo, set build command to `npm run build`, publish directory to `frontend/dist`
- **Any static file server** — `npx serve frontend/dist`

No environment variables needed — the API key is entered by the user at runtime.

## Security Notes

- Your Gemini API key is stored in **browser `localStorage`** as plaintext. Anyone with access to your browser's devtools can read it.
- Consider creating a **restricted API key** in Google AI Studio that only allows the Gemini API.
- On shared or public computers, use the **change key** button to clear the key from localStorage when done, or clear it manually via browser devtools → Application → Local Storage.

## How It Works

The terminal sends each command to Gemini with an injected shell state header (`cwd`, `exit_code`, `env`, `aliases`, `jobs`). Gemini responds with structured XML output:

```xml
<shell_output>
drwxr-xr-x 2 user user 4096 Apr 13 09:00 Documents
</shell_output>
<state>{"cwd":"/home/user","exit_code":0,"aliases":{...},"jobs":[]}</state>
```

A streaming parser (`byteScanner.ts`) processes the response in real time and renders ANSI escape codes as HTML using [`ansi-to-html`](https://github.com/rburns/ansi-to-html).

Conversation history is maintained in memory for the session. When it approaches the context limit, older turns are automatically summarized or snapshotted to keep things running smoothly.
