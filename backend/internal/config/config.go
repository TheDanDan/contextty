package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	GeminiAPIKey               string
	FirebaseServiceAccountJSON string
	UpstashRedisURL            string
	AllowedOrigins             []string
	Port                       string
	TrialCostLimit             float64
	TrialTTLSeconds            int
}

func Load() (*Config, error) {
	cfg := &Config{}

	cfg.GeminiAPIKey = os.Getenv("GEMINI_API_KEY")
	if cfg.GeminiAPIKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY is required")
	}

	cfg.FirebaseServiceAccountJSON = os.Getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
	if cfg.FirebaseServiceAccountJSON == "" {
		return nil, fmt.Errorf("FIREBASE_SERVICE_ACCOUNT_JSON is required")
	}

	cfg.UpstashRedisURL = os.Getenv("UPSTASH_REDIS_URL")
	if cfg.UpstashRedisURL == "" {
		return nil, fmt.Errorf("UPSTASH_REDIS_URL is required")
	}

	originsRaw := os.Getenv("ALLOWED_ORIGINS")
	if originsRaw == "" {
		originsRaw = "http://localhost:5173"
	}
	for _, o := range strings.Split(originsRaw, ",") {
		if trimmed := strings.TrimSpace(o); trimmed != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, trimmed)
		}
	}

	cfg.Port = os.Getenv("PORT")
	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	cfg.TrialCostLimit = 0.05
	if v := os.Getenv("TRIAL_COST_LIMIT"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			cfg.TrialCostLimit = f
		}
	}

	cfg.TrialTTLSeconds = 86400
	if v := os.Getenv("TRIAL_TTL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.TrialTTLSeconds = n
		}
	}

	return cfg, nil
}
