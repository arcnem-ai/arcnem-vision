package graphs

import (
	"context"
	"fmt"
	"time"

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
	FinishTarget   string   `json:"finish_target"`
	TimeoutSeconds int      `json:"timeout_seconds"`
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

	router := newSupervisorRouter(snapshotNode, cfg, model)
	nodeKey := snapshotNode.Node.NodeKey

	return &SupervisorRoutingResult{
		RoutingNode: &NodeToAdd{
			Name:        nodeKey,
			Description: fmt.Sprintf("Supervisor routing node: %s", nodeKey),
			Fn:          router.route,
		},
		RoutingTimeout:    supervisorTimeout(cfg),
		ConditionalEdgeFn: router.conditionalEdge,
		Members:           cfg.Members,
		Config:            cfg,
	}, nil
}
