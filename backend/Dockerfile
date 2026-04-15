# Stage 1: Build
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy module definition first so dependency download is cached separately
COPY go.mod ./
# Download and verify dependencies (generates go.sum inside the build)
RUN go mod download -x

# Copy all source and build the binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o server \
    ./cmd/server

# Stage 2: Minimal runtime image (~10 MB, no shell)
FROM gcr.io/distroless/static-debian12

COPY --from=builder /app/server /server

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/server"]
