5 Hardest Go & Backend Questions
1. "You mentioned cutting p95 latency by 40–60% using SSE. Why did you choose SSE over WebSockets, and how did you handle the 'head-of-line blocking' issues inherent to HTTP/1.1 if that's what you used?"
The Answer:
"I chose Server-Sent Events (SSE) because the data flow is strictly unidirectional (AI to client), and SSE is much lighter than WebSockets—it uses standard HTTP and handles reconnection out of the box. To achieve that 40–60% p95 reduction, I focused on immediate chunked writes. Instead of waiting for the full LLM response, I flushed each buffer chunk directly to the gin.Context writer. Regarding HOL blocking: since we are on HTTP/2 (via Cloud Run), the browser can multiplex these streams over a single connection, so one slow stream doesn't block others like it would in HTTP/1.1."

2. "Explain your 'goroutine-based stream fan-out.' How do you prevent goroutine leaks if a client abruptly closes their laptop or loses signal?"
The Answer:
"I used Context-aware cancellation. When the Gin request context is cancelled (detected via c.Request.Context().Done()), it triggers a signal to the background goroutines handling the stream. We use a select block inside the streaming loop: it listens to the LLM data channel and the ctx.Done() channel simultaneously. If the client disconnects, the Done() case fires, we close the buffered channels, and the goroutine exits cleanly. This prevents 'zombie' goroutines from continuing to process AI tokens for a disconnected user."

3. "You used Lua scripts in Upstash Redis for quota checking. Why Lua? Couldn't you just do a GET and then an INCR in your Go code?"
The Answer:
"Doing it in Go would introduce a Race Condition. If two requests hit at the exact same millisecond, both might read a quota of 99, see it's under the limit of 100, and then both increment it to 100, effectively allowing 101 requests. By using a Lua script, the operation is atomic within Redis. Redis executes the entire script (Check -> Increment -> Set TTL) as a single transaction, ensuring that even under high concurrency, we never breach the hard limit."

4. "How did you structure your multi-stage Docker build, and why did you choose a 'distroless' image for the final runtime?"
The Answer:
"The first stage uses the golang:1.xx-alpine image to compile the binary with CGO disabled (CGO_ENABLED=0) to ensure a static binary. The second stage copies only that binary into a gcr.io/distroless/static image. I chose distroless because it contains zero shell utilities (no sh, no apt, no ls). This drastically reduces the attack surface—if someone finds a RCE (Remote Code Execution) vulnerability, they can't spawn a shell or download malicious scripts because the tools simply aren't there."

5. "If your Go gateway scales to 10,000 concurrent streams, where is the bottleneck likely to shift, and how would you monitor it?"
The Answer:
"The bottleneck would likely shift to Redis connection pooling or upstream API rate limits from the AI provider. In Go, I would monitor the Heap Allocation and Active Goroutines using pprof. Specifically, since streaming keeps connections open for seconds or minutes, I'd watch for memory pressure from buffered channels. If memory spikes, I would tune the channel buffer sizes or implement backpressure logic to slow down the producers."

5 Hardest Questions on Project Architecture & Security
1. "How do you handle the 'Replay' of shell state in React without creating a massive 'flash of unstyled content' or re-running slow commands?"
The Answer:
"We don't actually re-run the commands. On every turn, the Go backend sends the serialized state (current directory, env vars). The React frontend maintains a local state transition log using the message history. For the LLM, we prepend this state header to every user command so the model has an authoritative 'ground truth' of the environment (cwd, env, exit codes) even though the underlying container simulation is stateless."

2. "You used 'Adaptive Message Compression' for long chats. How do you decide what to prune versus what to summarize without losing the user's 'intent'?"
The Answer:
"I implemented a Sliding Window with Summarization. We keep the most recent 20 messages in full fidelity. For older messages, we use the LLM to generate a compact JSON summary of the 'key context' and discard the raw text. We also prune 'transient turns'—specifically read-only commands like 'ls', 'pwd', or 'cat'—once they exceed a certain window, as they don't add permanent state changes to the simulated environment."

3. "Your CI/CD pipeline uses npm ci instead of npm install. Why is this distinction critical for a production-grade DevOps workflow?"
The Answer:
"npm install can update your package-lock.json if it finds newer compatible versions, leading to 'it works on my machine but fails in CI' bugs. npm ci (Clean Install) is deterministic. It requires a package-lock.json to exist, deletes the node_modules folder, and installs the exact versions specified. This ensures that every build in GitHub Actions is a perfect replica of the last successful test run."

4. "If a user steals a Firebase ID token, they could potentially spam your API. Beyond token verification, how did you secure the 'Usage Retrieval' path?"
The Answer:
"Inside the Gin middleware, we don't just check if the token is valid; we extract the sub (Subject/UID) claim from the decoded JWT. All Redis lookups for quotas and all database queries for history are hard-coded to use that UID. Even if a user tries to pass a different userId in the body of a request, the backend ignores it and only uses the ID from the cryptographically signed token, ensuring strict tenant isolation."

5. "Cloud Run is 'stateless.' How did you handle the user's terminal session if the container scales down to zero and then back up?"
The Answer:
"Because Cloud Run can terminate instances at any time, I moved all session 'memory' to Redis and the LLM context. The Go backend doesn't store any local variables about a user's session. Each request is 'self-describing'—it contains the message history and the current state. If a container dies and a new one spins up, it pulls the user's quota and state from Redis, making the infrastructure perfectly 'horizontally scalable'."