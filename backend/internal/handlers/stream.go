package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"llm-terminal/backend/internal/gemini"
	redisclient "llm-terminal/backend/internal/redis"
)

type streamRequest struct {
	Messages []gemini.Message `json:"messages"`
	Model    string           `json:"model"`
}

// StreamHandler handles POST /stream.
// It verifies the trial quota, then streams Gemini output as Server-Sent Events.
// The system prompt is always hardcoded server-side — the client's "system" field is ignored.
func StreamHandler(redis *redisclient.Client, gem *gemini.Client) gin.HandlerFunc {
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

		// Atomically check and increment the trial counter.
		_, allowed, err := redis.CheckAndIncrement(c.Request.Context(), uid)
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

		// Bridge channel: Gemini goroutine → SSE writer
		chanText := make(chan string, 64)
		errChan := make(chan error, 1)

		go func() {
			defer close(chanText)
			if err := gem.StreamText(c.Request.Context(), req.Messages, req.Model, chanText); err != nil {
				errChan <- err
			}
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
	}
}

func writeSSE(w io.Writer, data string) {
	fmt.Fprintf(w, "data: %s\n\n", data)
}
