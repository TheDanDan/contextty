package gemini

import (
	"context"
	"fmt"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"

	"contextty/backend/internal/prompts"
)

// Message mirrors the frontend's Message type.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Usage holds token counts from a completed Gemini request.
type Usage struct {
	InputTokens  int32
	OutputTokens int32
}

const DefaultModel = "gemini-2.5-flash-lite"

// modelPricing maps model name to [inputPricePerToken, outputPricePerToken] in USD.
var modelPricing = map[string][2]float64{
	"gemini-2.5-flash-lite": {0.10 / 1e6, 0.40 / 1e6},
	"gemini-2.5-flash":      {0.15 / 1e6, 0.60 / 1e6},
	"gemini-2.5-pro":        {0.625 / 1e6, 2.40 / 1e6},
}

// NormalizeModel clamps the requested model to the supported set.
func NormalizeModel(model string) string {
	if model == "" {
		return DefaultModel
	}
	switch model {
	case "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro":
		return model
	default:
		return DefaultModel
	}
}

// CostUSD returns the estimated USD cost for this usage given the model.
func (u Usage) CostUSD(model string) float64 {
	model = NormalizeModel(model)
	pricing, ok := modelPricing[model]
	if !ok {
		pricing = modelPricing[DefaultModel]
	}
	return float64(u.InputTokens)*pricing[0] + float64(u.OutputTokens)*pricing[1]
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
// Returns token usage after the stream completes.
func (c *Client) StreamText(ctx context.Context, messages []Message, model string, chanOut chan<- string) (Usage, error) {
	if len(messages) == 0 {
		return Usage{}, fmt.Errorf("messages must not be empty")
	}
	model = NormalizeModel(model)

	client, err := genai.NewClient(ctx, option.WithAPIKey(c.apiKey))
	if err != nil {
		return Usage{}, fmt.Errorf("genai.NewClient: %w", err)
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

	var finalUsage *genai.UsageMetadata
	iter := cs.SendMessageStream(ctx, genai.Text(lastMsg.Content))
	for {
		resp, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return Usage{}, fmt.Errorf("gemini stream: %w", err)
		}
		if resp.UsageMetadata != nil {
			finalUsage = resp.UsageMetadata
		}
		if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
			continue
		}
		for _, part := range resp.Candidates[0].Content.Parts {
			if txt, ok := part.(genai.Text); ok && txt != "" {
				select {
				case chanOut <- string(txt):
				case <-ctx.Done():
					return Usage{}, ctx.Err()
				}
			}
		}
	}

	var usage Usage
	if finalUsage != nil {
		usage.InputTokens = finalUsage.PromptTokenCount
		usage.OutputTokens = finalUsage.CandidatesTokenCount
	}
	return usage, nil
}
