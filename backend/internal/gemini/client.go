package gemini

import (
	"context"
	"fmt"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"

	"llm-terminal/backend/internal/prompts"
)

// Message mirrors the frontend's Message type.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Client holds a reusable Gemini AI client.
type Client struct {
	apiKey string
}

// NewClient creates a Gemini client.
func NewClient(apiKey string) *Client {
	return &Client{apiKey: apiKey}
}

// StreamText streams raw Gemini text chunks into the provided channel.
// The system prompt is always sourced server-side from prompts.SystemPrompt.
// The caller is responsible for closing nothing — StreamText closes chanOut when done.
func (c *Client) StreamText(ctx context.Context, messages []Message, model string, chanOut chan<- string) error {
	if len(messages) == 0 {
		return fmt.Errorf("messages must not be empty")
	}
	if model == "" {
		model = "gemini-2.5-flash"
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(c.apiKey))
	if err != nil {
		return fmt.Errorf("genai.NewClient: %w", err)
	}
	defer client.Close()

	gmodel := client.GenerativeModel(model)
	gmodel.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(prompts.SystemPrompt)},
	}
	maxTokens := int32(4096)
	gmodel.MaxOutputTokens = &maxTokens

	// Split messages: history = all but last, last user message = prompt
	history := make([]*genai.Content, 0, len(messages)-1)
	for _, m := range messages[:len(messages)-1] {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		history = append(history, &genai.Content{
			Role:  role,
			Parts: []genai.Part{genai.Text(m.Content)},
		})
	}

	lastMsg := messages[len(messages)-1]
	cs := gmodel.StartChat()
	cs.History = history

	iter := cs.SendMessageStream(ctx, genai.Text(lastMsg.Content))
	for {
		resp, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("gemini stream: %w", err)
		}
		if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
			continue
		}
		for _, part := range resp.Candidates[0].Content.Parts {
			if txt, ok := part.(genai.Text); ok && txt != "" {
				select {
				case chanOut <- string(txt):
				case <-ctx.Done():
					return ctx.Err()
				}
			}
		}
	}
	return nil
}
