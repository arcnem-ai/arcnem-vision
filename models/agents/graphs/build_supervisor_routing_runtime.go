package graphs

import (
	"context"
	"fmt"
	"log"

	"github.com/smallnest/langgraphgo/graph"
	"github.com/tmc/langchaingo/llms"
)

type supervisorRouter struct {
	nodeKey      string
	inputKey     *string
	outputKey    *string
	cfg          supervisorConfig
	model        llms.Model
	systemPrompt string
	routeTool    llms.Tool
	toolChoice   llms.ToolChoice
	memberSet    map[string]struct{}
}

func newSupervisorRouter(snapshotNode *SnapshotNode, cfg supervisorConfig, model llms.Model) supervisorRouter {
	options := make([]any, 0, len(cfg.Members)+1)
	memberSet := make(map[string]struct{}, len(cfg.Members))
	for _, member := range cfg.Members {
		options = append(options, member)
		memberSet[member] = struct{}{}
	}
	options = append(options, "FINISH")

	return supervisorRouter{
		nodeKey:      snapshotNode.Node.NodeKey,
		inputKey:     snapshotNode.Node.InputKey,
		outputKey:    snapshotNode.Node.OutputKey,
		cfg:          cfg,
		model:        model,
		systemPrompt: supervisorSystemPrompt(cfg),
		routeTool:    supervisorRouteTool(options),
		toolChoice: llms.ToolChoice{
			Type:     "function",
			Function: &llms.FunctionReference{Name: "route"},
		},
		memberSet: memberSet,
	}
}

func (r supervisorRouter) route(ctx context.Context, state map[string]any) (map[string]any, error) {
	iteration := nextSupervisorIteration(state)
	if iteration > r.cfg.MaxIterations {
		log.Printf(
			"graph supervisor_route_error node=%s iteration=%d error=%q limit=%d",
			r.nodeKey,
			iteration,
			"max iterations reached",
			r.cfg.MaxIterations,
		)
		return nil, fmt.Errorf("supervisor node %q hit max iterations (%d)", r.nodeKey, r.cfg.MaxIterations)
	}

	inputMessages, initialHumanMessage, err := r.buildInputMessages(ctx, state, iteration)
	if err != nil {
		return nil, r.wrapRouteError(iteration, err)
	}

	log.Printf(
		"graph supervisor_route node=%s iteration=%d members=%v message_count=%d",
		r.nodeKey,
		iteration,
		r.cfg.Members,
		len(inputMessages),
	)

	next, err := r.routeNext(ctx, inputMessages)
	if err != nil {
		return nil, r.wrapRouteError(iteration, err)
	}

	delta, err := r.buildDelta(state, iteration, next, initialHumanMessage)
	if err != nil {
		return nil, r.wrapRouteError(iteration, err)
	}

	r.logRouteDecision(iteration, next)
	return delta, nil
}

func (r supervisorRouter) conditionalEdge(_ context.Context, state map[string]any) string {
	next, _ := state[supervisorNextKey].(string)
	if next == "FINISH" || next == "" {
		if r.cfg.FinishTarget != "" {
			return r.cfg.FinishTarget
		}
		return graph.END
	}
	return next
}

func (r supervisorRouter) buildInputMessages(
	ctx context.Context,
	state map[string]any,
	iteration int,
) ([]llms.MessageContent, *llms.MessageContent, error) {
	inputMessages := []llms.MessageContent{
		llms.TextParts(llms.ChatMessageTypeSystem, r.systemPrompt),
	}

	if iteration == 1 {
		input := ""
		if r.inputKey != nil {
			loadedInput, err := loadStateString(state, *r.inputKey)
			if err != nil {
				return nil, nil, err
			}
			input = loadedInput
		}

		humanMessage, err := buildHumanInputMessage(
			ctx,
			input,
			nodeInputConfig{
				InputMode:   r.cfg.InputMode,
				InputPrompt: r.cfg.InputPrompt,
			},
			"Route this to the most appropriate specialist, then FINISH after the specialist responds.",
		)
		if err != nil {
			return nil, nil, err
		}

		inputMessages = append(inputMessages, humanMessage)
		return inputMessages, &humanMessage, nil
	}

	messages, err := loadStateMessages(state, "messages")
	if err != nil {
		return nil, nil, err
	}

	inputMessages = append(inputMessages, messages...)
	return inputMessages, nil, nil
}

func (r supervisorRouter) routeNext(ctx context.Context, inputMessages []llms.MessageContent) (string, error) {
	resp, err := r.model.GenerateContent(
		ctx,
		inputMessages,
		llms.WithTools([]llms.Tool{r.routeTool}),
		llms.WithToolChoice(r.toolChoice),
	)
	if err != nil {
		return "", fmt.Errorf("llm call failed: %w", err)
	}

	if len(resp.Choices) == 0 || len(resp.Choices[0].ToolCalls) == 0 {
		return "", fmt.Errorf("llm did not return a route tool call")
	}

	next, err := parseSupervisorRouteArguments(resp.Choices[0].ToolCalls[0].FunctionCall.Arguments)
	if err != nil {
		return "", err
	}
	if next == "FINISH" {
		return next, nil
	}

	if _, ok := r.memberSet[next]; !ok {
		return "", fmt.Errorf(
			"routed to unknown member %q, valid members: %v",
			next,
			r.cfg.Members,
		)
	}

	return next, nil
}

func (r supervisorRouter) buildDelta(
	state map[string]any,
	iteration int,
	next string,
	initialHumanMessage *llms.MessageContent,
) (map[string]any, error) {
	delta := map[string]any{
		supervisorNextKey:      next,
		supervisorIterationKey: iteration,
	}

	routingMessage := llms.TextParts(
		llms.ChatMessageTypeAI,
		fmt.Sprintf("[supervisor] routing to: %s", next),
	)

	if initialHumanMessage != nil {
		delta["messages"] = []llms.MessageContent{*initialHumanMessage, routingMessage}
	} else {
		delta["messages"] = []llms.MessageContent{routingMessage}
	}

	if next != "FINISH" || r.outputKey == nil {
		return delta, nil
	}

	messages, err := loadStateMessages(state, "messages")
	if err != nil {
		return nil, err
	}

	output := extractLastAIMessageFromSlice(messages)
	if output != "" {
		delta[*r.outputKey] = output
	}

	return delta, nil
}

func (r supervisorRouter) wrapRouteError(iteration int, err error) error {
	log.Printf(
		"graph supervisor_route_error node=%s iteration=%d error=%q",
		r.nodeKey,
		iteration,
		err,
	)
	return fmt.Errorf("supervisor node %q: %w", r.nodeKey, err)
}

func (r supervisorRouter) logRouteDecision(iteration int, next string) {
	if next == "FINISH" {
		log.Printf(
			"graph supervisor_route node=%s iteration=%d next=FINISH total_iterations=%d",
			r.nodeKey,
			iteration,
			iteration,
		)
		return
	}

	log.Printf(
		"graph supervisor_route node=%s iteration=%d next=%s",
		r.nodeKey,
		iteration,
		next,
	)
}

func nextSupervisorIteration(state map[string]any) int {
	if value, ok := state[supervisorIterationKey].(int); ok {
		return value + 1
	}
	if value, ok := state[supervisorIterationKey].(float64); ok {
		return int(value) + 1
	}
	return 1
}
