package graphs

import (
	"context"
	"fmt"
	"strings"
	"testing"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/tmc/langchaingo/llms"
)

type scriptedLLM struct {
	generate func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error)
}

func (m *scriptedLLM) GenerateContent(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
	if m.generate == nil {
		return textResponse(""), nil
	}
	return m.generate(ctx, messages, options...)
}

func (m *scriptedLLM) Call(ctx context.Context, prompt string, options ...llms.CallOption) (string, error) {
	resp, err := m.GenerateContent(ctx, []llms.MessageContent{
		llms.TextParts(llms.ChatMessageTypeHuman, prompt),
	}, options...)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", nil
	}
	return resp.Choices[0].Content, nil
}

func TestBuildGraphConditionRouteExecutesExpectedBranch(t *testing.T) {
	runnable, err := buildGraphWithModelFactory(conditionRouteSnapshot(), nil, func(provider string, modelName string, modelVersion string) (any, error) {
		switch modelName {
		case "urgent-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					return textResponse("urgent branch summary"), nil
				},
			}, nil
		case "routine-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					return textResponse("routine branch summary"), nil
				},
			}, nil
		default:
			return nil, fmt.Errorf("unexpected model request %s/%s@%s", provider, modelName, modelVersion)
		}
	})
	if err != nil {
		t.Fatalf("buildGraphWithModelFactory returned error: %v", err)
	}

	result, err := runnable.Invoke(context.Background(), map[string]any{
		"ocr_text": "URGENT dock temperature alert",
	})
	if err != nil {
		t.Fatalf("runnable.Invoke returned error: %v", err)
	}

	if got, ok := result["contains_urgent"].(bool); !ok || !got {
		t.Fatalf("expected contains_urgent=true, got %#v", result["contains_urgent"])
	}
	if got := result["summary"]; got != "urgent branch summary" {
		t.Fatalf("expected urgent branch summary, got %#v", got)
	}
}

func TestBuildGraphSupervisorRoutesWorkerAndFinishTarget(t *testing.T) {
	runnable, err := buildGraphWithModelFactory(supervisorRouteSnapshot(), nil, func(provider string, modelName string, modelVersion string) (any, error) {
		switch modelName {
		case "router-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					if hasSpecialistReply(messages) {
						return toolCallResponse("FINISH"), nil
					}
					joined := strings.ToUpper(allMessageText(messages))
					if strings.Contains(joined, "INVOICE") {
						return toolCallResponse("billing_worker"), nil
					}
					return toolCallResponse("operations_worker"), nil
				},
			}, nil
		case "billing-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					return textResponse("Billing specialist summary"), nil
				},
			}, nil
		case "operations-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					return textResponse("Operations specialist summary"), nil
				},
			}, nil
		case "save-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					return textResponse("Saved: " + lastHumanInput(messages)), nil
				},
			}, nil
		default:
			return nil, fmt.Errorf("unexpected model request %s/%s@%s", provider, modelName, modelVersion)
		}
	})
	if err != nil {
		t.Fatalf("buildGraphWithModelFactory returned error: %v", err)
	}

	result, err := runnable.Invoke(context.Background(), map[string]any{
		"ocr_text": "INVOICE #1048\nTotal Due: $482.15",
	})
	if err != nil {
		t.Fatalf("runnable.Invoke returned error: %v", err)
	}

	if got := result["ocr_review_summary"]; got != "Billing specialist summary" {
		t.Fatalf("expected billing summary, got %#v", got)
	}
	if got := result["saved_summary"]; got != "Saved: Billing specialist summary" {
		t.Fatalf("expected saved summary, got %#v", got)
	}
}

func TestBuildGraphSupervisorMemberRepairsStructuredOutputBeforeFinishing(t *testing.T) {
	callCount := 0
	runnable, err := buildGraphWithModelFactory(structuredSupervisorSnapshot(), nil, func(provider string, modelName string, modelVersion string) (any, error) {
		switch modelName {
		case "router-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					if extractLastAIMessageFromSlice(messages) != "" {
						return toolCallResponse("FINISH"), nil
					}
					return toolCallResponse("inspection_worker"), nil
				},
			}, nil
		case "inspection-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					callCount++
					if callCount == 1 {
						return textResponse(`{"inspection_photo_status":"retake required"}`), nil
					}

					if !strings.Contains(lastHumanInput(messages), "invalid") {
						t.Fatalf("expected repair prompt in follow-up human message, got %q", lastHumanInput(messages))
					}

					return textResponse(`{"finding_type":"needs_better_image","observation_text":"Retake with a closer, unobstructed view.","scene_description":"Close-up of a weld seam.","severity":"low","confidence":"low","manual_review_reason":null,"retake_recommendation":"Retake with better framing and even lighting."}`), nil
				},
			}, nil
		default:
			return nil, fmt.Errorf("unexpected model request %s/%s@%s", provider, modelName, modelVersion)
		}
	})
	if err != nil {
		t.Fatalf("buildGraphWithModelFactory returned error: %v", err)
	}

	result, err := runnable.Invoke(context.Background(), map[string]any{
		"inspection_input": "Review this inspection image.",
	})
	if err != nil {
		t.Fatalf("runnable.Invoke returned error: %v", err)
	}

	if callCount != 2 {
		t.Fatalf("expected 2 model calls, got %d", callCount)
	}
	if got := result["finding_summary"]; got != `{"confidence":"low","finding_type":"needs_better_image","manual_review_reason":null,"observation_text":"Retake with a closer, unobstructed view.","retake_recommendation":"Retake with better framing and even lighting.","scene_description":"Close-up of a weld seam.","severity":"low"}` {
		t.Fatalf("expected normalized finding summary, got %#v", got)
	}
}

func TestBuildGraphSupervisorMemberFailsWhenStructuredOutputNeverValidates(t *testing.T) {
	runnable, err := buildGraphWithModelFactory(structuredSupervisorSnapshot(), nil, func(provider string, modelName string, modelVersion string) (any, error) {
		switch modelName {
		case "router-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					return toolCallResponse("inspection_worker"), nil
				},
			}, nil
		case "inspection-model":
			return &scriptedLLM{
				generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
					return textResponse(`{"inspection_photo_status":"retake required"}`), nil
				},
			}, nil
		default:
			return nil, fmt.Errorf("unexpected model request %s/%s@%s", provider, modelName, modelVersion)
		}
	})
	if err != nil {
		t.Fatalf("buildGraphWithModelFactory returned error: %v", err)
	}

	_, err = runnable.Invoke(context.Background(), map[string]any{
		"inspection_input": "Review this inspection image.",
	})
	if err == nil {
		t.Fatal("expected structured output validation to fail")
	}
	if !strings.Contains(err.Error(), "invalid structured output") {
		t.Fatalf("expected invalid structured output error, got %v", err)
	}
}

func TestBuildGraphWorkerRepairsStructuredOutputBeforeCompleting(t *testing.T) {
	callCount := 0
	runnable, err := buildGraphWithModelFactory(structuredWorkerSnapshot(), nil, func(provider string, modelName string, modelVersion string) (any, error) {
		return &scriptedLLM{
			generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
				callCount++
				if callCount == 1 {
					return textResponse("```json\n{\"inspection_photo_status\":\"retake required\"}\n```"), nil
				}

				if !strings.Contains(lastHumanInput(messages), "invalid") {
					t.Fatalf("expected repair prompt in follow-up human message, got %q", lastHumanInput(messages))
				}

				return textResponse(`{"finding_type":"needs_better_image","observation_text":"Retake with a closer, unobstructed view.","scene_description":"Close-up of a weld seam.","severity":"low","confidence":"low","manual_review_reason":null,"retake_recommendation":"Retake with better framing and even lighting."}`), nil
			},
		}, nil
	})
	if err != nil {
		t.Fatalf("buildGraphWithModelFactory returned error: %v", err)
	}

	result, err := runnable.Invoke(context.Background(), map[string]any{
		"finding_draft": "The weld is partially blocked and needs a retake.",
	})
	if err != nil {
		t.Fatalf("runnable.Invoke returned error: %v", err)
	}

	if callCount != 2 {
		t.Fatalf("expected 2 model calls, got %d", callCount)
	}
	if got := result["finding_summary"]; got != `{"confidence":"low","finding_type":"needs_better_image","manual_review_reason":null,"observation_text":"Retake with a closer, unobstructed view.","retake_recommendation":"Retake with better framing and even lighting.","scene_description":"Close-up of a weld seam.","severity":"low"}` {
		t.Fatalf("expected normalized finding summary, got %#v", got)
	}
}

func TestBuildGraphWorkerFailsWhenStructuredOutputNeverValidates(t *testing.T) {
	runnable, err := buildGraphWithModelFactory(structuredWorkerSnapshot(), nil, func(provider string, modelName string, modelVersion string) (any, error) {
		return &scriptedLLM{
			generate: func(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
				return textResponse(`{"inspection_photo_status":"retake required"}`), nil
			},
		}, nil
	})
	if err != nil {
		t.Fatalf("buildGraphWithModelFactory returned error: %v", err)
	}

	_, err = runnable.Invoke(context.Background(), map[string]any{
		"finding_draft": "The weld is partially blocked and needs a retake.",
	})
	if err == nil {
		t.Fatal("expected structured output validation to fail")
	}
	if !strings.Contains(err.Error(), "invalid structured output") {
		t.Fatalf("expected invalid structured output error, got %v", err)
	}
}

func conditionRouteSnapshot() *Snapshot {
	summaryKey := "summary"
	return &Snapshot{
		AgentGraph: &dbmodels.AgentGraph{
			EntryNode: "route_keyword",
		},
		Nodes: []*SnapshotNode{
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:   "route_keyword",
					NodeType:  "condition",
					OutputKey: stringPtr("contains_urgent"),
					Config:    `{"source_key":"ocr_text","operator":"contains","value":"URGENT","case_sensitive":false,"true_target":"urgent_worker","false_target":"routine_worker"}`,
				},
			},
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:   "urgent_worker",
					NodeType:  "worker",
					InputKey:  stringPtr("ocr_text"),
					OutputKey: &summaryKey,
					Config:    `{"system_message":"urgent branch worker","max_iterations":1,"input_prompt":"Summarize this urgent notice."}`,
				},
				Model: fakeModel("OPENAI", "urgent-model"),
			},
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:   "routine_worker",
					NodeType:  "worker",
					InputKey:  stringPtr("ocr_text"),
					OutputKey: &summaryKey,
					Config:    `{"system_message":"routine branch worker","max_iterations":1,"input_prompt":"Summarize this routine notice."}`,
				},
				Model: fakeModel("OPENAI", "routine-model"),
			},
		},
		Edges: []*dbmodels.AgentGraphEdge{
			{
				FromNode: "urgent_worker",
				ToNode:   "END",
			},
			{
				FromNode: "routine_worker",
				ToNode:   "END",
			},
		},
	}
}

func supervisorRouteSnapshot() *Snapshot {
	return &Snapshot{
		AgentGraph: &dbmodels.AgentGraph{
			EntryNode: "ocr_review_supervisor",
		},
		Nodes: []*SnapshotNode{
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:   "ocr_review_supervisor",
					NodeType:  "supervisor",
					InputKey:  stringPtr("ocr_text"),
					OutputKey: stringPtr("ocr_review_summary"),
					Config:    `{"members":["billing_worker","operations_worker"],"input_prompt":"Route this OCR text to the best specialist.","max_iterations":4,"finish_target":"save_review_summary"}`,
				},
				Model: fakeModel("OPENAI", "router-model"),
			},
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:  "billing_worker",
					NodeType: "worker",
					Config:   `{"system_message":"billing specialist","max_iterations":1}`,
				},
				Model: fakeModel("OPENAI", "billing-model"),
			},
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:  "operations_worker",
					NodeType: "worker",
					Config:   `{"system_message":"operations specialist","max_iterations":1}`,
				},
				Model: fakeModel("OPENAI", "operations-model"),
			},
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:   "save_review_summary",
					NodeType:  "worker",
					InputKey:  stringPtr("ocr_review_summary"),
					OutputKey: stringPtr("saved_summary"),
					Config:    `{"system_message":"save review summary","max_iterations":1,"input_prompt":"Persist this review summary."}`,
				},
				Model: fakeModel("OPENAI", "save-model"),
			},
		},
		Edges: []*dbmodels.AgentGraphEdge{
			{
				FromNode: "save_review_summary",
				ToNode:   "END",
			},
		},
	}
}

func structuredWorkerSnapshot() *Snapshot {
	return &Snapshot{
		AgentGraph: &dbmodels.AgentGraph{
			EntryNode: "normalize_finding_summary",
		},
		Nodes: []*SnapshotNode{
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:   "normalize_finding_summary",
					NodeType:  "worker",
					InputKey:  stringPtr("finding_draft"),
					OutputKey: stringPtr("finding_summary"),
					Config:    `{"system_message":"Normalize the finding.","max_iterations":1,"output_retries":2,"output_schema":{"type":"object","additionalProperties":false,"required":["finding_type","observation_text","scene_description","severity","confidence","manual_review_reason","retake_recommendation"],"properties":{"finding_type":{"type":"string","enum":["acceptable_visual_condition","possible_weld_issue","possible_corrosion","needs_better_image","manual_review_required"]},"observation_text":{"type":"string"},"scene_description":{"type":["string","null"]},"severity":{"type":["string","null"],"enum":["low","medium","high"]},"confidence":{"type":["string","null"],"enum":["low","medium","high"]},"manual_review_reason":{"type":["string","null"]},"retake_recommendation":{"type":["string","null"]}}}}`,
				},
				Model: fakeModel("OPENAI", "normalize-model"),
			},
		},
		Edges: []*dbmodels.AgentGraphEdge{
			{
				FromNode: "normalize_finding_summary",
				ToNode:   "END",
			},
		},
	}
}

func structuredSupervisorSnapshot() *Snapshot {
	return &Snapshot{
		AgentGraph: &dbmodels.AgentGraph{
			EntryNode: "inspection_supervisor",
		},
		Nodes: []*SnapshotNode{
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:   "inspection_supervisor",
					NodeType:  "supervisor",
					InputKey:  stringPtr("inspection_input"),
					OutputKey: stringPtr("finding_summary"),
					Config:    `{"members":["inspection_worker"],"input_prompt":"Route this inspection review to the best specialist.","max_iterations":4}`,
				},
				Model: fakeModel("OPENAI", "router-model"),
			},
			{
				Node: &dbmodels.AgentGraphNode{
					NodeKey:  "inspection_worker",
					NodeType: "worker",
					Config:   `{"system_message":"inspection specialist","max_iterations":1,"output_retries":2,"output_schema":{"type":"object","additionalProperties":false,"required":["finding_type","observation_text","scene_description","severity","confidence","manual_review_reason","retake_recommendation"],"properties":{"finding_type":{"type":"string","enum":["acceptable_visual_condition","possible_weld_issue","possible_corrosion","needs_better_image","manual_review_required"]},"observation_text":{"type":"string"},"scene_description":{"type":["string","null"]},"severity":{"type":["string","null"],"enum":["low","medium","high"]},"confidence":{"type":["string","null"],"enum":["low","medium","high"]},"manual_review_reason":{"type":["string","null"]},"retake_recommendation":{"type":["string","null"]}}}}`,
				},
				Model: fakeModel("OPENAI", "inspection-model"),
			},
		},
		Edges: []*dbmodels.AgentGraphEdge{},
	}
}

func fakeModel(provider string, name string) *dbmodels.Model {
	return &dbmodels.Model{
		Provider: provider,
		Name:     name,
		Version:  "",
	}
}

func stringPtr(value string) *string {
	return &value
}

func textResponse(content string) *llms.ContentResponse {
	return &llms.ContentResponse{
		Choices: []*llms.ContentChoice{
			{
				Content: content,
			},
		},
	}
}

func toolCallResponse(next string) *llms.ContentResponse {
	return &llms.ContentResponse{
		Choices: []*llms.ContentChoice{
			{
				ToolCalls: []llms.ToolCall{
					{
						ID:   "route-1",
						Type: "function",
						FunctionCall: &llms.FunctionCall{
							Name:      "route",
							Arguments: fmt.Sprintf(`{"next":"%s"}`, next),
						},
					},
				},
			},
		},
	}
}

func allMessageText(messages []llms.MessageContent) string {
	parts := make([]string, 0, len(messages))
	for _, message := range messages {
		for _, part := range message.Parts {
			text, ok := part.(llms.TextContent)
			if !ok {
				continue
			}
			parts = append(parts, text.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func hasSpecialistReply(messages []llms.MessageContent) bool {
	for _, message := range messages {
		if message.Role != llms.ChatMessageTypeAI {
			continue
		}
		for _, part := range message.Parts {
			text, ok := part.(llms.TextContent)
			if !ok {
				continue
			}
			if strings.HasPrefix(text.Text, "[supervisor]") {
				continue
			}
			if strings.Contains(text.Text, "specialist summary") {
				return true
			}
		}
	}
	return false
}

func lastHumanInput(messages []llms.MessageContent) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != llms.ChatMessageTypeHuman {
			continue
		}
		for j := len(messages[i].Parts) - 1; j >= 0; j-- {
			text, ok := messages[i].Parts[j].(llms.TextContent)
			if !ok {
				continue
			}
			trimmed := strings.TrimSpace(text.Text)
			if trimmed != "" {
				return trimmed
			}
		}
	}
	return ""
}
