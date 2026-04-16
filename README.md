# Contextty

A stateful Unix shell emulator that runs in your browser, powered by Google Gemini AI.

Type real bash commands and get realistic terminal output — with persistent filesystem state, ANSI colors, pipes, redirects, interactive programs (vim, python REPL, etc.), and background jobs.

## Architecture

Contextty has two operating modes:

**BYOK (Bring Your Own Key)** — fully client-side. You paste a Gemini API key; the browser calls Gemini directly. No backend needed.

```
Browser  ──→  Google Gemini API
   ↕
localStorage (API key + session state)
```

**Trial mode** — backend-proxied. You sign in with Google or GitHub; the backend handles Gemini calls with a shared API key, quota-limited per user.

```
Browser  ──→  Go Backend (Gin)  ──→  Google Gemini API
   ↕               ↕
Firebase Auth    Upstash Redis (quota tracking)
```

## Getting Started

### Frontend

Requires **Node.js 18+**.

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You can either enter a Gemini API key (BYOK) or sign in with Google/GitHub (trial).

### Backend (trial mode only)

Requires **Go 1.23+**.

Copy `.env.example` to `.env` inside `backend/` and fill in the required values:

```bash
cd backend
cp .env.example .env
# edit .env with your credentials
go run ./cmd/server
```

The server starts on `PORT` (default `8080`). The frontend connects to it via `VITE_BACKEND_URL`.

**Required environment variables:**

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK service account (inline JSON) |
| `UPSTASH_REDIS_URL` | Upstash Redis TLS URL (`rediss://...`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `http://localhost:5173`) |
| `TRIAL_COST_LIMIT` | Max USD per user per window (default `0.05`) |
| `TRIAL_TTL_SECONDS` | Quota window in seconds (default `86400`) |

## Usage

Type any bash command at the prompt. The AI emulates a full Ubuntu 22.04 environment with persistent state across commands.

| Key | Action |
|-----|--------|
| `Enter` | Run command |
| `↑` / `↓` | Navigate command history |
| `Ctrl+C` | Interrupt current command |
| `Ctrl+L` | Clear screen |

The **reset** button wipes conversation history and starts a fresh shell session.

## Model Selection

Choose your model on the login/key screen:

| Model | Best for |
|-------|----------|
| `gemini-2.5-flash-lite` | Fastest responses, lowest cost — good for most use |
| `gemini-2.5-flash` | Balanced speed and quality |
| `gemini-2.5-pro` | Most capable, best at complex or ambiguous commands |

## How It Works

Each command is sent to Gemini with a shell state header (`cwd`, `exit_code`, `env`, `aliases`, `jobs`). Gemini responds with structured XML:

```xml
<shell_output>
drwxr-xr-x 2 user user 4096 Apr 13 09:00 Documents
</shell_output>
<state>{"cwd":"/home/user","exit_code":0,"aliases":{},"jobs":[]}</state>
```

A streaming parser (`byteScanner.ts`) processes the response in real time and renders ANSI escape codes as HTML.

Conversation history is kept in memory. When it approaches the context limit, older turns are automatically summarized or replaced with a full filesystem snapshot.

In **BYOK mode**, the system prompt lives in `frontend/src/lib/prompts.ts`. In **trial mode**, it lives in `backend/internal/prompts/system.go`. Both must be kept identical.

## Deployment

**Frontend** — deployed to Firebase Hosting automatically on merge to `main` via GitHub Actions.

```bash
cd frontend && npm run build
# dist/ is a static site deployable anywhere
```

**Backend** — containerized for Google Cloud Run.

```bash
cd backend
docker build -t contextty-backend .
# deploy to Cloud Run or any container host
```

## Security Notes

**BYOK mode:** Your Gemini API key is stored in browser `localStorage` as plaintext. Consider creating a restricted API key in Google AI Studio. On shared computers, use the **change key** button or clear it via devtools → Application → Local Storage.

**Trial mode:** Your API key never leaves the server. The backend injects the system prompt server-side, preventing prompt injection. Trial usage is capped per user per 24-hour window.
