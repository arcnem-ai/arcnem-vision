package graphs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/smallnest/langgraphgo/graph"
	"github.com/tmc/langchaingo/llms"
)

const (
	// State keys used by supervisor routing. Prefixed to avoid collision with user state.
	supervisorNextKey      = "__supervisor_next"
	supervisorIterationKey = "__supervisor_iteration"

	defaultSupervisorMaxIterations = 10
	defaultSupervisorTimeout       = 60 * time.Second
	defaultMemberWorkerTimeout     = 120 * time.Second
)

type supervisorConfig struct {
	Members        []string `json:"members"`
	MaxIterations  int      `json:"max_iterations"`
	InputMode      string   `json:"input_mode"`
	InputPrompt    string   `json:"input_prompt"`
	TimeoutSeconds int      `json:"timeout_seconds"`
}

func parseSupervisorConfig(snapshotNode *SnapshotNode) (supervisorConfig, error) {
	var cfg supervisorConfig
	if err := json.Unmarshal([]byte(snapshotNode.Node.Config), &cfg); err != nil {
		return supervisorConfig{}, fmt.Errorf("supervisor node %q: invalid config json: %w", snapshotNode.Node.NodeKey, err)
	}
	if len(cfg.Members) == 0 {
		return supervisorConfig{}, fmt.Errorf("supervisor node %q: config must specify \"members\"", snapshotNode.Node.NodeKey)
	}
	if cfg.MaxIterations <= 0 {
		cfg.MaxIterations = defaultSupervisorMaxIterations
	}
	return cfg, nil
}

func supervisorTimeout(cfg supervisorConfig) time.Duration {
	if cfg.TimeoutSeconds > 0 {
		return time.Duration(cfg.TimeoutSeconds) * time.Second
	}
	return defaultSupervisorTimeout
}

// SupervisorRoutingResult holds the outputs needed by BuildGraph to wire
// the supervisor routing node + conditional edge + member worker nodes.
type SupervisorRoutingResult struct {
	// RoutingNode is the supervisor LLM routing node to add to the graph.
	RoutingNode *NodeToAdd
	// RoutingTimeout is the timeout for the routing node.
	RoutingTimeout time.Duration
	// ConditionalEdgeFn determines the next node from state after routing.
	ConditionalEdgeFn func(ctx context.Context, state map[string]any) string
	// Members is the ordered list of member worker keys.
	Members []string
	// Config is the parsed supervisor config.
	Config supervisorConfig
}

// BuildSupervisorRoutingNode creates the supervisor routing node and conditional edge function.
// The routing node calls the LLM with a forced `route` tool to pick the next worker or FINISH.
// The conditional edge reads the routing decision from state and returns the next node name.
func BuildSupervisorRoutingNode(
	snapshotNode *SnapshotNode,
	modelClient any,
) (*SupervisorRoutingResult, error) {
	model, ok := modelClient.(llms.Model)
	if !ok {
		return nil, fmt.Errorf("supervisor node %q: model client does not implement llms.Model", snapshotNode.Node.NodeKey)
	}

	cfg, err := parseSupervisorConfig(snapshotNode)
	if err != nil {
		return nil, err
	}

	inputKey := snapshotNode.Node.InputKey
	outputKey := snapshotNode.Node.OutputKey
	nodeKey := snapshotNode.Node.NodeKey

	// Build the route tool with member names + FINISH as the enum.
	options := make([]any, 0, len(cfg.Members)+1)
	for _, m := range cfg.Members {
		options = append(options, m)
	}
	options = append(options, "FINISH")

	routeTool := llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name:        "route",
			Description: "Select the next worker to act, or FINISH if the task is complete.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"next": map[string]any{
						"type": "string",
						"enum": options,
					},
				},
				"required": []string{"next"},
			},
		},
	}
	toolChoice := llms.ToolChoice{
		Type:     "function",
		Function: &llms.FunctionReference{Name: "route"},
	}

	systemPrompt := fmt.Sprintf(
		"You are a supervisor tasked with managing a conversation between the following workers: %s. "+
			"Given the conversation so far, respond with the worker to act next or FINISH when the task is complete. "+
			"Use the 'route' tool to make your selection.",
		strings.Join(cfg.Members, ", "),
	)

	memberSet := make(map[string]struct{}, len(cfg.Members))
	for _, m := range cfg.Members {
		memberSet[m] = struct{}{}
	}

	routingFn := func(ctx context.Context, state map[string]any) (map[string]any, error) {
		// Read and increment iteration counter.
		iteration := 1
		if v, ok := state[supervisorIterationKey].(int); ok {
			iteration = v + 1
		}
		// Also handle float64 from JSON deserialization.
		if v, ok := state[supervisorIterationKey].(float64); ok {
			iteration = int(v) + 1
		}

		if iteration > cfg.MaxIterations {
			log.Printf(
				"graph supervisor_route_error node=%s iteration=%d error=%q limit=%d",
				nodeKey, iteration, "max iterations reached", cfg.MaxIterations,
			)
			return nil, fmt.Errorf("supervisor node %q hit max iterations (%d)", nodeKey, cfg.MaxIterations)
		}

		// Build messages for the LLM and track the initial human message for state.
		var inputMessages []llms.MessageContent
		var initialHumanMessage *llms.MessageContent
		inputMessages = append(inputMessages, llms.TextParts(llms.ChatMessageTypeSystem, systemPrompt))

		if iteration == 1 {
			// First iteration: build the initial human message from state[inputKey].
			var input string
			if inputKey != nil {
				input, _ = state[*inputKey].(string)
			}
			humanMessage, err := buildHumanInputMessage(ctx, input, nodeInputConfig{
				InputMode:   cfg.InputMode,
				InputPrompt: cfg.InputPrompt,
			}, "Route this to the most appropriate specialist, then FINISH after the specialist responds.")
			if err != nil {
				log.Printf(
					"graph supervisor_route_error node=%s iteration=%d error=%q",
					nodeKey, iteration, err,
				)
				return nil, fmt.Errorf("supervisor node %q: %w", nodeKey, err)
			}
			inputMessages = append(inputMessages, humanMessage)
			initialHumanMessage = &humanMessage
		} else {
			// Subsequent iterations: use accumulated messages from state.
			if msgs, ok := state["messages"].([]llms.MessageContent); ok {
				inputMessages = append(inputMessages, msgs...)
			}
		}

		log.Printf(
			"graph supervisor_route node=%s iteration=%d members=%v message_count=%d",
			nodeKey, iteration, cfg.Members, len(inputMessages),
		)

		// Call LLM with forced route tool.
		resp, err := model.GenerateContent(ctx, inputMessages,
			llms.WithTools([]llms.Tool{routeTool}),
			llms.WithToolChoice(toolChoice),
		)
		if err != nil {
			log.Printf(
				"graph supervisor_route_error node=%s iteration=%d error=%q",
				nodeKey, iteration, err,
			)
			return nil, fmt.Errorf("supervisor node %q: llm call failed: %w", nodeKey, err)
		}

		if len(resp.Choices) == 0 || len(resp.Choices[0].ToolCalls) == 0 {
			log.Printf(
				"graph supervisor_route_error node=%s iteration=%d error=%q",
				nodeKey, iteration, "no tool call in response",
			)
			return nil, fmt.Errorf("supervisor node %q: llm did not return a route tool call", nodeKey)
		}

		var args struct {
			Next string `json:"next"`
		}
		if err := json.Unmarshal([]byte(resp.Choices[0].ToolCalls[0].FunctionCall.Arguments), &args); err != nil {
			log.Printf(
				"graph supervisor_route_error node=%s iteration=%d error=%q",
				nodeKey, iteration, err,
			)
			return nil, fmt.Errorf("supervisor node %q: failed to parse route arguments: %w", nodeKey, err)
		}

		next := strings.TrimSpace(args.Next)

		// Validate the routing decision.
		if next != "FINISH" {
			if _, valid := memberSet[next]; !valid {
				log.Printf(
					"graph supervisor_route_error node=%s iteration=%d error=%q member=%s valid=%v",
					nodeKey, iteration, "unknown member", next, cfg.Members,
				)
				return nil, fmt.Errorf("supervisor node %q: routed to unknown member %q, valid members: %v", nodeKey, next, cfg.Members)
			}
		}

		// Build the state delta.
		delta := map[string]any{
			supervisorNextKey:      next,
			supervisorIterationKey: iteration,
		}

		// Record the supervisor's routing as a message so workers and future
		// iterations can see the conversation history.
		routingMessage := llms.TextParts(llms.ChatMessageTypeAI,
			fmt.Sprintf("[supervisor] routing to: %s", next),
		)

		// On first iteration, include the initial human message in the conversation
		// (reuse the already-built message to avoid double image processing).
		if initialHumanMessage != nil {
			delta["messages"] = []llms.MessageContent{*initialHumanMessage, routingMessage}
		} else {
			delta["messages"] = []llms.MessageContent{routingMessage}
		}

		// If FINISH, extract the final output for the outputKey.
		if next == "FINISH" && outputKey != nil {
			// Extract the last meaningful AI message from accumulated messages.
			if msgs, ok := state["messages"].([]llms.MessageContent); ok {
				output := extractLastAIMessageFromSlice(msgs)
				if output != "" {
					delta[*outputKey] = output
				}
			}
			log.Printf(
				"graph supervisor_route node=%s iteration=%d next=FINISH total_iterations=%d",
				nodeKey, iteration, iteration,
			)
		} else {
			log.Printf(
				"graph supervisor_route node=%s iteration=%d next=%s",
				nodeKey, iteration, next,
			)
		}

		return delta, nil
	}

	// Build the conditional edge function.
	conditionalEdgeFn := func(_ context.Context, state map[string]any) string {
		next, _ := state[supervisorNextKey].(string)
		if next == "FINISH" || next == "" {
			return graph.END
		}
		return next
	}

	return &SupervisorRoutingResult{
		RoutingNode: &NodeToAdd{
			Name:        nodeKey,
			Description: fmt.Sprintf("Supervisor routing node: %s", nodeKey),
			Fn:          routingFn,
		},
		RoutingTimeout:    supervisorTimeout(cfg),
		ConditionalEdgeFn: conditionalEdgeFn,
		Members:           cfg.Members,
		Config:            cfg,
	}, nil
}

// extractLastAIMessageFromSlice pulls text from the last AI message in a slice.
func extractLastAIMessageFromSlice(messages []llms.MessageContent) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == llms.ChatMessageTypeAI {
			for _, part := range messages[i].Parts {
				if text, ok := part.(llms.TextContent); ok {
					// Skip our own routing marker messages.
					if strings.HasPrefix(text.Text, "[supervisor]") {
						continue
					}
					return text.Text
				}
			}
		}
	}
	return ""
}
