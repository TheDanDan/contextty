package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
	"github.com/gin-gonic/gin"
	"google.golang.org/api/option"
)

// Client wraps the Firebase auth client.
type Client struct {
	inner *firebaseauth.Client
}

// NewClient initializes the Firebase Admin SDK from a service account JSON string.
func NewClient(ctx context.Context, serviceAccountJSON string) (*Client, error) {
	app, err := firebase.NewApp(ctx, nil, option.WithCredentialsJSON([]byte(serviceAccountJSON)))
	if err != nil {
		return nil, fmt.Errorf("firebase.NewApp: %w", err)
	}
	authClient, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("app.Auth: %w", err)
	}
	return &Client{inner: authClient}, nil
}

// Middleware returns a Gin middleware that verifies the Firebase ID token in the
// Authorization header and sets "uid" in the Gin context.
func (c *Client) Middleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		header := ctx.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		idToken := strings.TrimPrefix(header, "Bearer ")

		token, err := c.inner.VerifyIDToken(ctx.Request.Context(), idToken)
		if err != nil {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		ctx.Set("uid", token.UID)
		ctx.Next()
	}
}
