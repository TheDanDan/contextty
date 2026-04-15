package redis

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// Client wraps the Redis client with trial-usage helpers.
type Client struct {
	rdb    *redis.Client
	limit  int
	ttlSec int
}

// checkAndIncrScript atomically increments the counter only if it is below the
// limit. On the very first increment (new key), it sets the TTL.
// Returns {current_count, 1} if allowed, {current_count, 0} if limit exceeded.
var checkAndIncrScript = redis.NewScript(`
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl_seconds = tonumber(ARGV[2])
local current = redis.call('GET', key)
if current == false then current = 0 else current = tonumber(current) end
if current >= limit then return {current, 0} end
local new = redis.call('INCR', key)
if new == 1 then redis.call('EXPIRE', key, ttl_seconds) end
return {new, 1}
`)

// NewClient creates a Redis client from an Upstash rediss:// URL.
func NewClient(redisURL string, limit, ttlSec int) (*Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("redis.ParseURL: %w", err)
	}
	rdb := redis.NewClient(opts)
	return &Client{rdb: rdb, limit: limit, ttlSec: ttlSec}, nil
}

// CheckAndIncrement atomically checks the user's usage and increments if allowed.
// Returns (messagesUsed, allowed, error).
func (c *Client) CheckAndIncrement(ctx context.Context, uid string) (int64, bool, error) {
	key := "trial:usage:" + uid
	result, err := checkAndIncrScript.Run(ctx, c.rdb, []string{key},
		c.limit, c.ttlSec,
	).Slice()
	if err != nil {
		return 0, false, fmt.Errorf("redis script: %w", err)
	}
	used := result[0].(int64)
	allowedInt := result[1].(int64)
	return used, allowedInt == 1, nil
}

// GetUsage returns the current message count and remaining TTL (in seconds) for a user.
// Returns (used, ttlSeconds, error). If the key doesn't exist, used=0 and ttlSeconds=0.
func (c *Client) GetUsage(ctx context.Context, uid string) (int64, int64, error) {
	key := "trial:usage:" + uid
	pipe := c.rdb.Pipeline()
	getCmd := pipe.Get(ctx, key)
	ttlCmd := pipe.TTL(ctx, key)

	_, _ = pipe.Exec(ctx)

	var used int64
	if v, err := getCmd.Int64(); err == nil {
		used = v
	}

	ttlDur, _ := ttlCmd.Result()
	ttlSec := int64(ttlDur.Seconds())
	if ttlSec < 0 {
		ttlSec = 0
	}

	return used, ttlSec, nil
}

// Close closes the Redis client.
func (c *Client) Close() error {
	return c.rdb.Close()
}
