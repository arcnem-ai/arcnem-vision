package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"reflect"
	"time"

	"github.com/sashabaranov/go-openai"
	"github.com/tmc/langchaingo/llms"
)

// OpenAIClient bridges the graph's model interface to the SDK's Responses API.
type OpenAIClient struct {
	client *openai.Client
	model  string
}

func NewOpenAIClient(modelName string) (*OpenAIClient, error) {
	key := os.Getenv("OPENAI_API_KEY")
	if key == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY not set")
	}
	cfg := openai.DefaultConfig(key)
	cfg.HTTPClient = &http.Client{Timeout: 5 * time.Minute}
	return &OpenAIClient{client: openai.NewClientWithConfig(cfg), model: modelName}, nil
}

// GenerationConfig lives in worker/supervisor node config, not shared clients.
type GenerationConfig struct {
	ReasoningEffort string `json:"reasoning_effort"`
	MaxOutputTokens int    `json:"max_output_tokens"`
}

func (c GenerationConfig) Validate() error {
	switch c.ReasoningEffort {
	case "", "none", "minimal", "low", "medium", "high", "xhigh", "max":
	default:
		return fmt.Errorf("invalid reasoning_effort %q", c.ReasoningEffort)
	}
	if c.MaxOutputTokens < 0 {
		return fmt.Errorf("max_output_tokens must be positive when set")
	}
	return nil
}

type generationContextKey struct{}
type responsesSession struct {
	config   GenerationConfig
	input    []any
	messages []llms.MessageContent
}

// WithGeneration starts one sequential model/tool conversation. Each invocation
// owns its encrypted reasoning; shared model clients never retain user content.
func WithGeneration(ctx context.Context, config GenerationConfig) context.Context {
	return context.WithValue(ctx, generationContextKey{}, &responsesSession{config: config})
}

func (m *OpenAIClient) Call(ctx context.Context, prompt string, options ...llms.CallOption) (string, error) {
	r, err := m.GenerateContent(ctx, []llms.MessageContent{llms.TextParts(llms.ChatMessageTypeHuman, prompt)}, options...)
	if err != nil {
		return "", err
	}
	return r.Choices[0].Content, nil
}

func (m *OpenAIClient) SupportsReasoning() bool { return true }

func (m *OpenAIClient) GenerateContent(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
	s, ok := ctx.Value(generationContextKey{}).(*responsesSession)
	if !ok {
		s = &responsesSession{}
	}
	if err := s.config.Validate(); err != nil {
		return nil, err
	}
	if len(messages) < len(s.messages) || (len(s.messages) > 0 && !reflect.DeepEqual(messages[:len(s.messages)], s.messages)) {
		return nil, fmt.Errorf("Responses conversation history changed during invocation")
	}
	input := append([]any{}, s.input...)
	for _, message := range messages[len(s.messages):] {
		items, err := responsesInput(message)
		if err != nil {
			return nil, err
		}
		input = append(input, items...)
	}
	var opts llms.CallOptions
	for _, option := range options {
		option(&opts)
	}
	if opts.StreamingFunc != nil || opts.StreamingReasoningFunc != nil || len(opts.Functions) != 0 || opts.N > 1 || opts.CandidateCount > 1 || len(opts.StopWords) > 0 {
		return nil, fmt.Errorf("unsupported Responses call options")
	}
	store := false
	req := openai.CreateResponseRequest{
		Model: m.model, Input: input, Store: &store,
		Include:         []openai.ResponseInclude{openai.ResponseIncludeReasoningEncryptedContent},
		MaxOutputTokens: s.config.MaxOutputTokens,
	}
	if opts.Model != "" {
		req.Model = opts.Model
	}
	if opts.MaxTokens != 0 {
		req.MaxOutputTokens = opts.MaxTokens
	}
	if s.config.ReasoningEffort != "" {
		req.Reasoning = &openai.ResponseReasoning{Effort: s.config.ReasoningEffort}
	}
	if opts.Temperature != 0 {
		v := float32(opts.Temperature)
		req.Temperature = &v
	}
	if opts.TopP != 0 {
		v := float32(opts.TopP)
		req.TopP = &v
	}
	if opts.JSONMode {
		req.Text = &openai.ResponseTextConfig{Format: &openai.ResponseTextFormat{Type: "json_object"}}
	}
	for _, tool := range opts.Tools {
		if tool.Type != "function" || tool.Function == nil {
			return nil, fmt.Errorf("unsupported Responses tool type %q", tool.Type)
		}
		fn := tool.Function
		t := openai.NewResponseFunctionTool(openai.FunctionDefinition{Name: fn.Name, Description: fn.Description, Parameters: fn.Parameters, Strict: fn.Strict})
		// Responses defaults to strict schemas; preserve optional MCP arguments.
		t.Parameters["strict"] = fn.Strict
		req.Tools = append(req.Tools, t)
	}
	switch choice := opts.ToolChoice.(type) {
	case nil:
	case string:
		req.ToolChoice = choice
	case llms.ToolChoice:
		if choice.Type != "function" || choice.Function == nil {
			return nil, fmt.Errorf("invalid Responses tool choice")
		}
		req.ToolChoice = map[string]any{"type": "function", "name": choice.Function.Name}
	default:
		return nil, fmt.Errorf("unsupported Responses tool choice %T", choice)
	}
	response, err := m.client.CreateResponse(ctx, req)
	if err != nil {
		return nil, err
	}
	if response.Error != nil {
		return nil, fmt.Errorf("Responses failed (%s)", response.Error.Code)
	}
	if response.Status != openai.ResponseStatusCompleted {
		reason := ""
		if response.IncompleteDetails != nil {
			reason = response.IncompleteDetails.Reason
		}
		return nil, fmt.Errorf("Responses status %s (%s)", response.Status, reason)
	}
	choice := &llms.ContentChoice{StopReason: "stop", GenerationInfo: map[string]any{"response_id": response.ID, "usage": response.Usage}}
	for _, raw := range response.Output {
		data, err := json.Marshal(raw)
		if err != nil {
			return nil, err
		}
		var item openai.ResponseOutputItem
		if err := json.Unmarshal(data, &item); err != nil {
			return nil, err
		}
		switch item.Type {
		case "reasoning":
		case "message":
			for _, part := range item.Content {
				switch part.Type {
				case "output_text":
					choice.Content += part.Text
				case "refusal":
					return nil, fmt.Errorf("Responses refused the request")
				default:
					return nil, fmt.Errorf("unsupported Responses output content %q", part.Type)
				}
			}
		case "function_call":
			if item.CallID == "" || item.Name == "" || !json.Valid([]byte(item.Arguments)) {
				return nil, fmt.Errorf("invalid Responses function call")
			}
			choice.ToolCalls = append(choice.ToolCalls, llms.ToolCall{ID: item.CallID, Type: "function", FunctionCall: &llms.FunctionCall{Name: item.Name, Arguments: item.Arguments}})
		default:
			return nil, fmt.Errorf("unsupported Responses output item %q", item.Type)
		}
	}
	if choice.Content == "" && len(choice.ToolCalls) == 0 {
		return nil, fmt.Errorf("Responses returned no text or tool calls")
	}
	if len(choice.ToolCalls) > 0 {
		choice.StopReason = "tool_calls"
	}
	log.Printf("openai responses id=%s model=%s reasoning_effort=%s status=%s", response.ID, req.Model, s.config.ReasoningEffort, response.Status)
	// Match langgraphgo's message while retaining all raw Responses output items.
	ai := llms.MessageContent{Role: llms.ChatMessageTypeAI}
	if choice.Content != "" {
		ai.Parts = append(ai.Parts, llms.TextPart(choice.Content))
	}
	for _, call := range choice.ToolCalls {
		ai.Parts = append(ai.Parts, call)
	}
	s.input = append(input, response.Output...)
	s.messages = append(append([]llms.MessageContent{}, messages...), ai)
	return &llms.ContentResponse{Choices: []*llms.ContentChoice{choice}}, nil
}

func responsesInput(message llms.MessageContent) ([]any, error) {
	role := ""
	switch message.Role {
	case llms.ChatMessageTypeHuman:
		role = "user"
	case llms.ChatMessageTypeAI:
		role = "assistant"
	case llms.ChatMessageTypeSystem:
		role = "system"
	case llms.ChatMessageTypeTool:
		role = "tool"
	default:
		return nil, fmt.Errorf("unsupported Responses message role %q", message.Role)
	}
	var items []any
	var content []any
	for _, part := range message.Parts {
		switch p := part.(type) {
		case llms.TextContent:
			if role == "tool" {
				return nil, fmt.Errorf("tool output requires a call ID")
			}
			contentType := "input_text"
			if role == "assistant" {
				contentType = "output_text"
			}
			content = append(content, openai.ResponseInputText{Type: contentType, Text: p.Text})
		case llms.ImageURLContent:
			if role != "user" || p.URL == "" {
				return nil, fmt.Errorf("invalid Responses image input")
			}
			content = append(content, openai.ResponseInputImage{Type: "input_image", ImageURL: p.URL, Detail: p.Detail})
		case llms.ToolCall:
			if role != "assistant" || p.ID == "" || p.FunctionCall == nil {
				return nil, fmt.Errorf("invalid Responses function history")
			}
			items = append(items, openai.ResponseOutputItem{Type: "function_call", CallID: p.ID, Name: p.FunctionCall.Name, Arguments: p.FunctionCall.Arguments})
		case llms.ToolCallResponse:
			if role != "tool" || p.ToolCallID == "" {
				return nil, fmt.Errorf("invalid Responses tool result")
			}
			items = append(items, openai.ResponseFunctionCallOutput{Type: "function_call_output", CallID: p.ToolCallID, Output: p.Content})
		default:
			return nil, fmt.Errorf("unsupported Responses input part %T", part)
		}
	}
	if len(content) > 0 {
		items = append([]any{openai.ResponseInputMessage{Role: role, Content: content}}, items...)
	}
	return items, nil
}
