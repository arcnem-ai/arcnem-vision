//go:build provider_live

package graphs

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/joho/godotenv"
	"github.com/smallnest/langgraphgo/prebuilt"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

type liveLookupTool struct{}

func (liveLookupTool) Name() string { return "lookup_total" }
func (liveLookupTool) Description() string {
	return "Returns the verified total. Call this to answer the user."
}
func (liveLookupTool) Call(context.Context, string) (string, error) { return `{"total":42}`, nil }

// Opt-in: go test -tags provider_live ./graphs -run TestLiveResponses -v
func TestLiveResponses(t *testing.T) {
	if env := os.Getenv("VISION_PROBE_ENV"); env != "" {
		if err := godotenv.Load(env); err != nil {
			t.Fatal(err)
		}
	}
	if os.Getenv("OPENAI_API_KEY") == "" {
		t.Fatal("OPENAI_API_KEY required for provider_live")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	model, err := clients.NewOpenAIClient("gpt-5.6-luna")
	if err != nil {
		t.Fatal(err)
	}
	agent, err := prebuilt.CreateAgentMap(model, []tools.Tool{liveLookupTool{}}, 5)
	if err != nil {
		t.Fatal(err)
	}
	result, err := agent.Invoke(clients.WithGeneration(ctx, clients.GenerationConfig{ReasoningEffort: "low", MaxOutputTokens: 4096}), map[string]any{"messages": []llms.MessageContent{llms.TextParts(llms.ChatMessageTypeHuman, "Use lookup_total and tell me the total in one sentence."), llms.TextParts(llms.ChatMessageTypeAI, "[supervisor] routing to: lookup worker")}})
	if err != nil {
		t.Fatal(err)
	}
	messages, err := loadResultMessages(result)
	if err != nil {
		t.Fatal(err)
	}
	answer, err := extractLastAIMessage(messages)
	if err != nil || !strings.Contains(answer, "42") {
		t.Fatalf("unexpected answer %q: %v", answer, err)
	}
	toolResults := 0
	for _, m := range messages {
		if m.Role == llms.ChatMessageTypeTool {
			toolResults++
		}
	}
	if toolResults == 0 {
		t.Fatal("model did not use tool")
	}
	t.Logf("Luna low reasoning + tool: %s (%d tool results)", answer, toolResults)
	image, err := os.ReadFile("../../../server/scripts/fixtures/mountain-vista.jpg")
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(image)
	}))
	defer server.Close()
	input, output := "image", "answer"
	node, err := BuildWorkerNode(&SnapshotNode{Node: &dbmodels.AgentGraphNode{NodeKey: "describe", InputKey: &input, OutputKey: &output, Config: `{"input_mode":"image_url","input_prompt":"Describe the visible landscape. Return JSON with description (one sentence) and has_mountains (boolean).","reasoning_effort":"low","max_output_tokens":4096,"output_schema":{"type":"object","required":["description","has_mountains"],"additionalProperties":false,"properties":{"description":{"type":"string"},"has_mountains":{"type":"boolean"}}}}`}}, model, nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err = node.Fn(ctx, map[string]any{"image": server.URL})
	if err != nil {
		t.Fatal(err)
	}
	var description struct {
		Description  string `json:"description"`
		HasMountains bool   `json:"has_mountains"`
	}
	if err = json.Unmarshal([]byte(result["answer"].(string)), &description); err != nil {
		t.Fatal(err)
	}
	if !description.HasMountains || len(description.Description) < 20 {
		t.Fatalf("unexpected image result: %+v", description)
	}
	t.Logf("Luna low reasoning + structured image extraction: %s", result["answer"])
}
