# Contextty — Project Overview

Contextty is a browser-based Unix shell emulator backed by Google Gemini AI. Users type real bash commands and receive realistic terminal output with persistent shell state (cwd, env vars, exit codes, jobs) across turns.

## Repository Structure

```
/
├── frontend/   React + TypeScript + Vite SPA (see frontend/CLAUDE.md)
├── backend/    Go + Gin API server (see backend/CLAUDE.md)
├── tui/        Python TUI client — out of scope, do not modify
└── README.md   User-facing project docs
```

## Two Operating Modes

| Mode | Who calls Gemini | Auth | System prompt location |
|------|-----------------|------|------------------------|
| **BYOK** | Browser (client-side) | Gemini API key in localStorage | `frontend/src/lib/prompts.ts` |
| **Trial** | Go backend | Firebase JWT + Upstash Redis quota | `backend/internal/prompts/system.go` |

Both modes use the same frontend codebase. The `ApiKeyGate` component decides which path to take at runtime.

## Critical Cross-Cutting Invariants

These must stay consistent across both codebases:

1. **System prompt** — `frontend/src/lib/prompts.ts` (`SYSTEM_PROMPT`) and `backend/internal/prompts/system.go` (`SystemPrompt`) must be identical. If you change one, change both.

2. **XML tag names** — The LLM response format uses `<shell_output>`, `<state>`, and `<mode>` tags. The frontend parser (`byteScanner.ts`) and the backend stream handler both rely on these names. Do not rename tags without updating both sides.

3. **Model name strings** — Must match across frontend model selector (`ApiKeyGate.tsx`) and backend normalization (`gemini/client.go`): `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`.

## CI/CD

- GitHub Actions automatically builds and deploys the **frontend** to Firebase Hosting on merge to `main`.
- **Backend** has no CI/CD automation — deploy manually via Docker to Cloud Run.
- Firebase project: `contextty-af847`

## Where to Look

- Frontend details, commands, file map: `frontend/CLAUDE.md`
- Backend details, commands, env vars, package map: `backend/CLAUDE.md`
- User-facing setup and usage: `README.md`
