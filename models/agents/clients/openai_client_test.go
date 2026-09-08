package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sashabaranov/go-openai"
	"github.com/smallnest/langgraphgo/prebuilt"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

type responseTestTool struct{}

func (responseTestTool) Name() string                                 { return "lookup" }
func (responseTestTool) Description() string                          { return "Read the total" }
func (responseTestTool) Call(context.Context, string) (string, error) { return "42", nil }

// Exercise the actual graph tool loop, including a correction turn and a fresh
// invocation on the same client. Raw reasoning must survive only within its run.
func TestResponsesGraphToolLoop(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/responses" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("wrong endpoint/auth")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(body)
		if body["store"] != false || body["max_output_tokens"] != float64(4096) || body["reasoning"].(map[string]any)["effort"] != "low" {
			t.Errorf("lost generation settings")
		}
		if !strings.Contains(string(raw), "reasoning.encrypted_content") {
			t.Error("missing reasoning include")
		}
		w.Header().Set("Content-Type", "application/json")
		switch calls {
		case 1, 4:
			if strings.Contains(string(raw), "opaque-reasoning") {
				t.Error("reasoning leaked into another invocation")
			}
			if !strings.Contains(string(raw), `"detail":"high"`) {
				t.Error("image detail lost")
			}
			defs := body["tools"].([]any)
			if defs[0].(map[string]any)["strict"] != false {
				t.Error("optional tool args made strict")
			}
			fmt.Fprint(w, `{"id":"r1","status":"completed","output":[{"id":"rs1","type":"reasoning","summary":[],"encrypted_content":"opaque-reasoning"},{"id":"fc1","type":"function_call","call_id":"call1","name":"lookup","arguments":"{\"input\":\"total\"}"}]}`)
		case 2, 5:
			if !strings.Contains(string(raw), "opaque-reasoning") || !strings.Contains(string(raw), `"call_id":"call1","output":"42"`) || !strings.Contains(string(raw), `"id":"fc1"`) {
				t.Errorf("lost reasoning or call/result identity: %s", raw)
			}
			fmt.Fprint(w, `{"id":"r2","status":"completed","output":[{"id":"m2","type":"message","role":"assistant","content":[{"type":"output_text","text":"The total is 42."}]}]}`)
		case 3:
			if !strings.Contains(string(raw), "opaque-reasoning") || !strings.Contains(string(raw), `"id":"m2"`) {
				t.Error("correction lost previous outputs")
			}
			fmt.Fprint(w, `{"id":"r3","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"42"}]}]}`)
		default:
			t.Errorf("unexpected request %d", calls)
		}
	}))
	defer server.Close()
	cfg := openai.DefaultConfig("test-key")
	cfg.BaseURL = server.URL
	model := &OpenAIClient{client: openai.NewClientWithConfig(cfg), model: "gpt-5.6-luna"}
	agent, err := prebuilt.CreateAgentMap(model, []tools.Tool{responseTestTool{}}, 5)
	if err != nil {
		t.Fatal(err)
	}
	input := []llms.MessageContent{{Role: llms.ChatMessageTypeHuman, Parts: []llms.ContentPart{llms.ImageURLWithDetailPart("data:image/png;base64,example", "high"), llms.TextPart("Use lookup to find the total.")}}}
	ctx := WithGeneration(context.Background(), GenerationConfig{ReasoningEffort: "low", MaxOutputTokens: 4096})
	result, err := agent.Invoke(ctx, map[string]any{"messages": input})
	if err != nil {
		t.Fatal(err)
	}
	messages := result["messages"].([]llms.MessageContent)
	messages = append(messages, llms.TextParts(llms.ChatMessageTypeHuman, "Return only the number."))
	result, err = agent.Invoke(ctx, map[string]any{"messages": messages})
	if err != nil {
		t.Fatal(err)
	}
	messages = result["messages"].([]llms.MessageContent)
	if messages[len(messages)-1].Parts[0].(llms.TextContent).Text != "42" {
		t.Fatal("wrong final answer")
	}
	if _, err = agent.Invoke(WithGeneration(context.Background(), GenerationConfig{ReasoningEffort: "low", MaxOutputTokens: 4096}), map[string]any{"messages": input}); err != nil {
		t.Fatal(err)
	}
	if calls != 5 {
		t.Fatalf("expected five calls, got %d", calls)
	}
}

func TestResponsesErrorsAndForcedRouting(t *testing.T) {
	for _, tc := range []struct {
		name, body, want string
		status           int
	}{
		{"incomplete", `{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}`, "incomplete", 200},
		{"refusal", `{"status":"completed","output":[{"type":"message","content":[{"type":"refusal","refusal":"private reason"}]}]}`, "refused", 200},
		{"empty", `{"status":"completed","output":[]}`, "no text", 200},
		{"invalid_tool", `{"status":"completed","output":[{"type":"function_call","name":"route","arguments":"{}"}]}`, "invalid", 200},
		{"api_error", `{"error":{"message":"private body","type":"server_error"}}`, "", 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				_ = json.NewDecoder(r.Body).Decode(&body)
				choice := body["tool_choice"].(map[string]any)
				if choice["name"] != "route" || choice["function"] != nil {
					t.Error("tool choice not flattened")
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				fmt.Fprint(w, tc.body)
			}))
			defer server.Close()
			cfg := openai.DefaultConfig("test-key")
			cfg.BaseURL = server.URL
			model := &OpenAIClient{client: openai.NewClientWithConfig(cfg), model: "gpt-5.6-luna"}
			_, err := model.GenerateContent(context.Background(), []llms.MessageContent{llms.TextParts(llms.ChatMessageTypeHuman, "route")}, llms.WithToolChoice(llms.ToolChoice{Type: "function", Function: &llms.FunctionReference{Name: "route"}}))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.status == 503 {
				if status, retry := classifyProviderError(context.Background(), err); status != "503" || !retry {
					t.Fatalf("SDK error lost retry classification: %s %v", status, retry)
				}
			}
		})
	}
	for _, cfg := range []GenerationConfig{{ReasoningEffort: "typo"}, {MaxOutputTokens: -1}} {
		if cfg.Validate() == nil {
			t.Error("invalid config accepted")
		}
	}
}

func TestResponsesAssistantHistory(t *testing.T) {
	items, err := responsesInput(llms.TextParts(llms.ChatMessageTypeAI, "[supervisor] routing to: worker"))
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(items)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"type":"output_text"`) || strings.Contains(string(data), `"type":"input_text"`) {
		t.Fatalf("assistant history must use output_text: %s", data)
	}
}
