package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	redisclient "llm-terminal/backend/internal/redis"
)

// UsageHandler handles GET /me.
// Returns the current trial cost usage for the authenticated user.
func UsageHandler(redis *redisclient.Client, costLimit float64) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := c.GetString("uid")

		costUsed, ttlSec, err := redis.GetUsage(c.Request.Context(), uid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch usage"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"uid":               uid,
			"cost_used":         costUsed,
			"cost_limit":        costLimit,
			"resets_in_seconds": ttlSec,
		})
	}
}
