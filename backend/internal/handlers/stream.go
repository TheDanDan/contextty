package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"llm-terminal/backend/internal/gemini"
	redisclient "llm-terminal/backend/internal/redis"
)

type streamRequest struct {
	Messages []gemini.Message `json:"messages"`
	Model    string           `json:"model"`
}

// StreamHandler handles POST /stream.
// It verifies the trial cost quota, then streams Gemini output as Server-Sent Events.
// The system prompt is always hardcoded server-side — the client's "system" field is ignored.
func StreamHandler(redis *redisclient.Client, gem *gemini.Client, costLimit float64) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := c.GetString("uid")

		var req streamRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}
		if len(req.Messages) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "messages must not be empty"})
			return
		}

		// Pre-check: reject if the user has already hit the cost limit.
		_, allowed, err := redis.CheckCostLimit(c.Request.Context(), uid, costLimit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "usage check failed"})
			return
		}
		if !allowed {
			c.JSON(http.StatusPaymentRequired, gin.H{"error": "trial_limit_exceeded"})
			return
		}

		// Set SSE headers before writing anything.
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no") // disable Nginx buffering

		// Bridge channels: Gemini goroutine → SSE writer
		chanText := make(chan string, 64)
		errChan := make(chan error, 1)
		usageChan := make(chan gemini.Usage, 1)

		model := req.Model
		if model == "" {
			model = "gemini-2.5-flash"
		}

		go func() {
			defer close(chanText)
			usage, err := gem.StreamText(c.Request.Context(), req.Messages, model, chanText)
			if err != nil {
				errChan <- err
				return
			}
			usageChan <- usage
		}()

		c.Stream(func(w io.Writer) bool {
			select {
			case text, ok := <-chanText:
				if !ok {
					// Goroutine closed the channel — stream finished normally.
					writeSSE(w, "[DONE]")
					return false
				}
				// JSON-encode the text chunk so newlines and special chars are safe in SSE.
				encoded, err := json.Marshal(map[string]string{"t": text})
				if err != nil {
					writeSSE(w, "[ERROR] encode_failed")
					return false
				}
				writeSSE(w, string(encoded))
				return true

			case err := <-errChan:
				writeSSE(w, fmt.Sprintf("[ERROR] %s", err.Error()))
				return false

			case <-c.Request.Context().Done():
				return false
			}
		})

		// Record cost only on successful Gemini completion.
		// Gemini errors send to errChan and never populate usageChan, so the
		// default branch fires and the user's usage counter is left unchanged.
		// A detached context is used so cost is recorded even if the client
		// disconnected and the request context is already cancelled.
		select {
		case usage := <-usageChan:
			cost := usage.CostUSD(model)
			if cost > 0 {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if _, err := redis.AddCost(ctx, uid, cost); err != nil {
					fmt.Printf("warn: failed to record cost for uid=%s: %v\n", uid, err)
				}
			}
		default:
			// Gemini error or cancellation; do not charge the user.
		}
	}
}

func writeSSE(w io.Writer, data string) {
	fmt.Fprintf(w, "data: %s\n\n", data)
}
