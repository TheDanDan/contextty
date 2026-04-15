package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	redisclient "llm-terminal/backend/internal/redis"
)

// UsageHandler handles GET /me.
// Returns the current trial usage for the authenticated user.
func UsageHandler(redis *redisclient.Client, limit int) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := c.GetString("uid")

		used, ttlSec, err := redis.GetUsage(c.Request.Context(), uid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch usage"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"uid":               uid,
			"messages_used":     used,
			"limit":             limit,
			"resets_in_seconds": ttlSec,
		})
	}
}
