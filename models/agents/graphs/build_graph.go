package graphs

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/smallnest/langgraphgo/graph"
)

type modelClientFactory func(provider string, modelName string, modelVersion string) (any, error)

func defaultModelClientFactory(provider string, modelName string, _ string) (any, error) {
	return clients.NewModelClient(provider, modelName)
}

func BuildGraph(agentGraphSnapshot *Snapshot, mcpClient *clients.MCPClient) (*graph.StateRunnable[map[string]any], error) {
	return buildGraphWithModelFactory(agentGraphSnapshot, mcpClient, defaultModelClientFactory)
}

func buildGraphWithModelFactory(
	agentGraphSnapshot *Snapshot,
	mcpClient *clients.MCPClient,
	newModelClient modelClientFactory,
) (*graph.StateRunnable[map[string]any], error) {
	if err := validateSnapshot(agentGraphSnapshot); err != nil {
		return nil, fmt.Errorf("invalid graph snapshot: %w", err)
	}
	if newModelClient == nil {
		return nil, errors.New("model client factory is nil")
	}

	g := graph.NewStateGraph[map[string]any]()

	// Always use map schema so node outputs are merged into state.
	// Without a schema, langgraphgo replaces state with the last node result.
	schema := graph.NewMapSchema()
	if agentGraphSnapshot.AgentGraph.StateSchema != nil {
		stateSchemaJSON := strings.TrimSpace(*agentGraphSnapshot.AgentGraph.StateSchema)
		if stateSchemaJSON == "" {
			stateSchemaJSON = "{}"
		}
		var reducerConfig map[string]string
		if err := json.Unmarshal([]byte(stateSchemaJSON), &reducerConfig); err != nil {
			return nil, fmt.Errorf("failed to parse state_schema: %w", err)
		}
		for key, reducerType := range reducerConfig {
			switch reducerType {
			case "append":
				schema.RegisterReducer(key, graph.AppendReducer)
			case "overwrite":
				schema.RegisterReducer(key, graph.OverwriteReducer)
			default:
				return nil, fmt.Errorf("unknown reducer type %q for key %q", reducerType, key)
			}
		}
	}

	supervisors, conditions, supervisorMembers, err := collectRoutingNodeInfo(
		agentGraphSnapshot,
	)
	if err != nil {
		return nil, err
	}

	// If any supervisor exists, auto-register the message AppendReducer
	// so workers and supervisors can share conversation history.
	if len(supervisors) > 0 {
		schema.RegisterReducer("messages", graph.AppendReducer)
	}
	g.SetSchema(schema)

	// Deduplicate model clients by provider:model:version.
	modelClients, err := buildModelClients(agentGraphSnapshot, newModelClient)
	if err != nil {
		return nil, err
	}
	builtNodes, err := buildWorkerAndToolNodes(
		agentGraphSnapshot,
		mcpClient,
		modelClients,
		supervisorMembers,
	)
	if err != nil {
		return nil, err
	}
	if err := buildRoutingNodes(
		agentGraphSnapshot,
		modelClients,
		builtNodes,
		supervisors,
		conditions,
	); err != nil {
		return nil, err
	}

	addBuiltNodesToGraph(g, builtNodes, supervisors, supervisorMembers)
	wireGraphEdges(g, agentGraphSnapshot, supervisors, conditions)

	return g.Compile()
}
