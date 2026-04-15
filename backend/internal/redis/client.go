package redis

import (
	"context"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"
)

// Client wraps the Redis client with trial-cost helpers.
type Client struct {
	rdb    *redis.Client
	ttlSec int
}

// addCostScript atomically increments the cost counter and sets the TTL on first use.
// Returns the new cumulative cost as a bulk string.
var addCostScript = redis.NewScript(`
local key = KEYS[1]
local cost = ARGV[1]
local ttl_seconds = tonumber(ARGV[2])
local new = redis.call('INCRBYFLOAT', key, cost)
if redis.call('TTL', key) == -1 then
    redis.call('EXPIRE', key, ttl_seconds)
end
return new
`)

// NewClient creates a Redis client from an Upstash rediss:// URL.
func NewClient(redisURL string, ttlSec int) (*Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("redis.ParseURL: %w", err)
	}
	rdb := redis.NewClient(opts)
	return &Client{rdb: rdb, ttlSec: ttlSec}, nil
}

// CheckCostLimit returns the current cumulative cost and whether it is below the limit.
func (c *Client) CheckCostLimit(ctx context.Context, uid string, limit float64) (float64, bool, error) {
	key := "trial:cost:" + uid
	val, err := c.rdb.Get(ctx, key).Float64()
	if err == redis.Nil {
		return 0, true, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("redis GET: %w", err)
	}
	return val, val < limit, nil
}

// AddCost atomically adds cost to the user's cumulative total and ensures a TTL is set.
// Returns the new cumulative cost.
func (c *Client) AddCost(ctx context.Context, uid string, cost float64) (float64, error) {
	key := "trial:cost:" + uid
	res, err := addCostScript.Run(ctx, c.rdb, []string{key},
		strconv.FormatFloat(cost, 'f', -1, 64),
		c.ttlSec,
	).Text()
	if err != nil {
		return 0, fmt.Errorf("redis addCost script: %w", err)
	}
	total, err := strconv.ParseFloat(res, 64)
	if err != nil {
		return 0, fmt.Errorf("parse cost result: %w", err)
	}
	return total, nil
}

// GetUsage returns the current cumulative cost and remaining TTL (in seconds) for a user.
// Returns (costUsed, ttlSeconds, error). If the key doesn't exist, costUsed=0 and ttlSeconds=0.
func (c *Client) GetUsage(ctx context.Context, uid string) (float64, int64, error) {
	key := "trial:cost:" + uid
	pipe := c.rdb.Pipeline()
	getCmd := pipe.Get(ctx, key)
	ttlCmd := pipe.TTL(ctx, key)

	_, _ = pipe.Exec(ctx)

	var costUsed float64
	if v, err := getCmd.Float64(); err == nil {
		costUsed = v
	}

	ttlDur, _ := ttlCmd.Result()
	ttlSec := int64(ttlDur.Seconds())
	if ttlSec < 0 {
		ttlSec = 0
	}

	return costUsed, ttlSec, nil
}

// Close closes the Redis client.
func (c *Client) Close() error {
	return c.rdb.Close()
}
