# Resume Bullet Bank (Top 5 x 5 Roles)

All bullets follow the Google XYZ format: Accomplished [X] as measured by [Y], by doing [Z].

## 1. Backend Engineer (Go/Gin)

- Spearheaded snappier AI response streaming, cutting p95 time-to-first-token by 40–60%, through Server-Sent Events forwarding in a Go Gin gateway with chunked writes.
- Orchestrated smoother high-concurrency streaming, supporting 2–3x more simultaneous sessions in load tests, via goroutine-based stream fan-out with buffered channels and context-aware cancellation.
- Enforced predictable trial spend, blocking 100% of over-limit requests in tested scenarios, through a pre-stream Redis quota check before dispatching Gemini generation.
- Fortified usage accounting under concurrency, with zero observed overcharge anomalies, using atomic Lua-scripted INCRBYFLOAT + TTL updates in Upstash Redis.
- Streamlined production runtime, delivering 20–35% faster startup and a smaller container footprint, by packaging a multi-stage Go build into a distroless runtime image.

## 2. Full-Stack Engineer (React + Go)

- Crafted a live terminal experience that feels continuous and responsive, with visibly streaming output and lower perceived latency, by carrying Gemini output through Go SSE into incremental React rendering.
- Cultivated reliable session continuity, keeping command context stable across long conversations, by serializing shell state (cwd/env/jobs/exit code) and replaying it on every model turn.
- Stabilized long-running chats, reducing context-window failures, with adaptive message compression using summary snapshots and transient-turn pruning.
- Empowered cost-aware decisions with real-time token transparency, surfacing active tokens, estimated spend, and per-message burn rate via frontend telemetry.
- Refined cross-device usability, reducing friction on mobile and desktop, with responsive terminal controls, prompt focus management, and thoughtful history navigation.

## 3. Cloud/DevOps Engineer (Cloud Run + Firebase + CI/CD)

- Delivered scalable production serving with stable latency under bursty traffic, by shipping a stateless containerized API on Google Cloud Run’s auto-scaling platform.
- Accelerated release cycles with automatic production deploys on every main merge, by wiring GitHub Actions to build and publish frontend artifacts to Firebase Hosting.
- Strengthened pre-merge confidence with PR-specific preview environments for stakeholder testing, by enabling pull-request-triggered Firebase Hosting preview deployments in CI.
- Standardized delivery quality with consistent build outputs across runs, by codifying pinned, repeatable `npm ci` install/build steps in workflow automation.
- Minimized operational overhead to near-zero manual deploy steps, by running secret-managed, fully automated pipelines on GitHub-hosted runners.

## 4. Security-Focused Software Engineer (Auth + API Security)

- Hardened protected routes with 100% rejection of unauthenticated access in testing, by implementing Firebase ID token verification middleware in Gin.
- Preserved strict tenant isolation with zero cross-user usage leakage in testing, by scoping quota keys to UID and enforcing authenticated usage retrieval paths.
- Reduced API exposure risk by blocking wildcard-origin access in production, via an allowlist-based CORS policy with tightly restricted methods and headers.
- Protected sensitive credentials with zero server API secrets exposed to browsers, by keeping Gemini key management backend-only with environment-based secret injection.
- Built a resilient auth-state experience with consistent session gating after refresh and logout, using frontend Firebase auth listeners plus token-based backend authorization.

## 5. AI Application Engineer (Gemini Integration)

- Shipped production-grade LLM interactions with real-time command output in interactive sessions, by integrating Gemini streaming with structured shell output and state parsing.
- Elevated response relevance with noticeably better command-following in user testing, by centralizing system prompts server-side and injecting structured context.
- Kept AI usage cost-aware with bounded per-user trial spend, by calculating model-specific token pricing and enforcing quotas with Redis TTL resets.
- Improved resilience during upstream failures, reducing dead-end sessions, with explicit stream error signaling and graceful frontend recovery.
- Enabled flexible model tier switching without disrupting UX, through configurable model selection and shared session orchestration logic.

## Optional Role Titles You Can Use

- Backend Software Engineer (Go)
- Full-Stack Software Engineer (React/Go)
- Cloud Software Engineer (GCP)
- Security-Focused Software Engineer
- AI Application Engineer
