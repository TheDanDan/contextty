# Frontend — Contextty

React + TypeScript SPA built with Vite. Implements both the BYOK (client-side Gemini) and trial (backend-proxied) paths.

## Commands

```bash
npm run dev           # Vite dev server → http://localhost:5173
npm run build         # tsc + vite build → dist/
npm run preview       # Preview production build locally
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier format
npm run format:check  # Check formatting without writing
```

No test suite. Verify behavior manually via dev server.

## Environment Variables

Set in `.env.local` (dev) or `.env.production` (prod). All prefixed `VITE_` per Vite convention.

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase Web SDK key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_BACKEND_URL` | Trial backend URL (default: `http://localhost:8080`) |

BYOK mode needs no env vars — the user supplies their Gemini API key at runtime.

## Source Map

### `src/lib/` — Core business logic

| File | Responsibility |
|------|---------------|
| `sessionManager.ts` | Main orchestrator. Owns conversation history, shell state, token usage, and compression triggers. Entry point for all command execution. |
| `geminiClient.ts` | BYOK path. Wraps `@google/genai` SDK, streams response chunks, yields typed `ChunkType` tuples. |
| `trialClient.ts` | Trial path. Calls backend `/stream` via SSE, handles `402` quota-exceeded response. |
| `byteScanner.ts` | Streaming XML parser. Reads raw LLM chunks and extracts `<shell_output>`, `<state>`, `<mode>` blocks in real time. Must stay in sync with tag names. |
| `compressor.ts` | Context compression. Summarizes old messages at 100k tokens (soft limit); does a full snapshot reset at 180k tokens (hard limit). Called by `sessionManager.ts`. |
| `prompts.ts` | `SYSTEM_PROMPT` (defines bash 5.2 emulation rules) plus compression/snapshot prompts. **Must stay identical to `backend/internal/prompts/system.go`.** |
| `shellState.ts` | Data model for simulated shell state: `cwd`, `env`, `exit_code`, `aliases`, `jobs`. Serializes to JSON for LLM context injection. |
| `firebaseAuth.ts` | Firebase auth helpers: Google/GitHub sign-in, sign-out, ID token retrieval. |

### `src/components/`

| File | Responsibility |
|------|---------------|
| `Terminal.tsx` | Main UI. Renders output history, input bar, usage stats, mode indicator, settings modal. |
| `ApiKeyGate.tsx` | Auth/setup screen. Three paths: paste API key (BYOK), sign in with Google (trial), sign in with GitHub (trial). Also hosts the model selector. |
| `PromptBar.tsx` | Command input with arrow-key history navigation. |
| `OutputLine.tsx` | Renders a single terminal line; applies ANSI-to-HTML conversion. |
| `Tooltip.tsx` | Hover tooltip wrapper. |

### `src/hooks/`

| File | Responsibility |
|------|---------------|
| `useTerminal.ts` | Bridges `sessionManager` to the UI. Manages output entries, command history, PS1 updates, and streaming chunk ingestion. |

### `src/types.ts`

Shared TypeScript interfaces: `Message`, `OutputEntry`, `ShellStateData`, `TokenUsage`, `ChunkType`.

## Architecture Patterns

**Streaming pipeline:** Both `geminiClient` and `trialClient` are async generators that yield `[ChunkType, string]` tuples. `useTerminal.ts` consumes them identically regardless of mode.

**Auth branching:** `ApiKeyGate` determines the mode and passes either a Gemini API key string or a Firebase ID token to `useTerminal`. From there, `sessionManager` picks the right client.

**Context compression:** `sessionManager` calls `compressor.ts` automatically when `TokenUsage` hits the soft or hard limit. No manual intervention needed.

**Transient commands:** Commands like `ls`, `cat`, `grep` are flagged as transient in `sessionManager`. Transient messages are excluded from context summaries to avoid wasting tokens on ephemeral output.

**Shell state injection:** Each turn prepends a `[SHELL STATE ...]` header to the user message containing the current `ShellStateData` JSON. The LLM returns an updated `<state>` block which `sessionManager` parses and applies.

## Conventions

- TypeScript strict mode throughout. Avoid `any` except at SDK type boundaries.
- Prettier is enforced — run `npm run format` before committing.
- Imports use path aliases; see `tsconfig.json` for configuration.
- ANSI color codes: the app normalizes both real escape sequences and literal `\e[` / `\033[` strings before passing to `ansi-to-html`.
