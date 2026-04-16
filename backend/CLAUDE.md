# Backend — Contextty

Go 1.23 API server using Gin. Handles trial mode: authenticates users via Firebase, enforces per-user cost quotas via Upstash Redis, and proxies requests to Google Gemini with a server-side API key.

## Commands

```bash
go run ./cmd/server    # Start server (reads env vars or .env file)
go build ./...         # Build all packages
go test ./...          # Run tests
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Required at startup:

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | — (required) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK service account as inline JSON | — (required) |
| `UPSTASH_REDIS_URL` | Redis TLS connection string (`rediss://...`) | — (required) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | — (required) |
| `PORT` | HTTP listen port | `8080` |
| `TRIAL_COST_LIMIT` | Max USD per user per quota window | `0.05` |
| `TRIAL_TTL_SECONDS` | Quota window duration in seconds | `86400` |

## Package Map

```
cmd/server/main.go               Entry point; wires all components, registers routes
internal/config/config.go        Env var loading and validation
internal/auth/firebase.go        Firebase JWT middleware; sets user UID in Gin context
internal/handlers/stream.go      POST /stream handler
internal/handlers/usage.go       GET /me handler
internal/gemini/client.go        Gemini SDK wrapper
internal/prompts/system.go       Server-side system prompt
internal/redis/client.go         Upstash Redis quota logic
```

### Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Health check |
| `POST` | `/stream` | Firebase JWT | Stream a shell command through Gemini |
| `GET` | `/me` | Firebase JWT | Return current trial usage for the authenticated user |

### `POST /stream` flow

1. Firebase middleware verifies `Authorization: Bearer <token>`, sets UID in context
2. Handler checks Redis quota — returns `402 Payment Required` if exceeded
3. Opens SSE connection, forwards raw Gemini text chunks to client
4. On completion, records the turn's cost to Redis (atomic Lua script)

### `GET /me` response

```json
{ "cost": 0.012, "limit": 0.05, "ttl_seconds": 72400 }
```

## Key Invariants

- **System prompt** in `internal/prompts/system.go` (`SystemPrompt`) must stay identical to `frontend/src/lib/prompts.ts` (`SYSTEM_PROMPT`). If you change one, change both.
- **Model name strings** accepted by `gemini/client.go`: `gemini-2.5-flash-lite` (default), `gemini-2.5-flash`, `gemini-2.5-pro`. These must match what the frontend sends.
- **SSE format**: raw text chunks are forwarded directly from Gemini with no envelope. The frontend `trialClient.ts` parses them the same way it parses direct Gemini SDK responses.
- **`402` response**: when a user's Redis cost exceeds `TRIAL_COST_LIMIT`, the handler returns HTTP 402. `trialClient.ts` in the frontend handles this specifically to show a quota-exceeded message.
- **Redis atomicity**: `AddCost` uses a Lua script to increment cost and set TTL in a single atomic operation. Do not replace this with two separate Redis calls.

## Pricing Reference

Costs are tracked in USD and computed from token usage returned by Gemini:

| Model | Input (per M tokens) | Output (per M tokens) |
|-------|---------------------|----------------------|
| `gemini-2.5-flash-lite` | $0.10 | $0.40 |
| `gemini-2.5-flash` | $0.15 | $0.60 |
| `gemini-2.5-pro` | $0.625 | $2.40 |

## Deployment

- **Dockerfile**: multi-stage build — `golang:1.23` builder → `gcr.io/distroless/base` runtime (~10 MB image)
- Intended for **Google Cloud Run** (reads `PORT` from environment automatically)
- No CI/CD automation — deploy manually:

```bash
docker build -t contextty-backend .
# push and deploy to Cloud Run
```
