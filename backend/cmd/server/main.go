package main

import (
	"context"
	"log"
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"contextty/backend/internal/auth"
	"contextty/backend/internal/config"
	"contextty/backend/internal/gemini"
	"contextty/backend/internal/handlers"
	redisclient "contextty/backend/internal/redis"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()

	// Firebase Auth client
	firebaseClient, err := auth.NewClient(ctx, cfg.FirebaseServiceAccountJSON)
	if err != nil {
		log.Fatalf("firebase auth: %v", err)
	}

	// Upstash Redis client
	redisClient, err := redisclient.NewClient(cfg.UpstashRedisURL, cfg.TrialTTLSeconds)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}
	defer redisClient.Close()

	// Gemini client (reusable, API key stored server-side)
	geminiClient := gemini.NewClient(cfg.GeminiAPIKey)

	// Gin router
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// CORS — restrict to allowed origins only, never wildcard
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check (no auth required)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Authenticated routes
	protected := r.Group("/")
	protected.Use(firebaseClient.Middleware())
	{
		protected.POST("/stream", handlers.StreamHandler(redisClient, geminiClient, cfg.TrialCostLimit))
		protected.GET("/me", handlers.UsageHandler(redisClient, cfg.TrialCostLimit))
	}

	addr := ":" + cfg.Port
	log.Printf("starting server on %s (allowed origins: %v)", addr, cfg.AllowedOrigins)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server: %v", err)
	}
}
