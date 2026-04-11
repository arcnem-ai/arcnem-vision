package load

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	"github.com/arcnem-ai/arcnem-vision/models/agents/utils"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
)

func decodeDocumentAndAgentGraphRow(row DocumentAndAgentGraphRow) (*DocumentAndAgentGraph, error) {
	document, err := decodeDocumentPayload(row.DocumentJSON)
	if err != nil {
		return nil, err
	}

	agentGraph, err := decodeOptionalAgentGraphPayload(row.AgentGraphJSON)
	if err != nil {
		return nil, err
	}

	nodes, err := utils.DecodeJSONSlice[graphs.SnapshotNode](row.NodesJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to decode graph nodes payload: %w", err)
	}

	edges, err := utils.DecodeJSONSlice[dbmodels.AgentGraphEdge](row.EdgesJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to decode graph edges payload: %w", err)
	}

	return &DocumentAndAgentGraph{
		Document: document,
		GraphSnapshot: &graphs.Snapshot{
			AgentGraph: agentGraph,
			Nodes:      nodes,
			Edges:      edges,
		},
	}, nil
}

func decodeDocumentPayload(payload json.RawMessage) (*dbmodels.Document, error) {
	document := &dbmodels.Document{}
	if err := json.Unmarshal(payload, document); err != nil {
		return nil, fmt.Errorf("failed to decode document payload: %w", err)
	}

	return document, nil
}

func decodeOptionalAgentGraphPayload(payload json.RawMessage) (*dbmodels.AgentGraph, error) {
	if isEmptyJSONPayload(payload) {
		return nil, nil
	}

	agentGraph := &dbmodels.AgentGraph{}
	if err := json.Unmarshal(payload, agentGraph); err != nil {
		return nil, fmt.Errorf("failed to decode agent graph payload: %w", err)
	}

	return agentGraph, nil
}

func isEmptyJSONPayload(payload json.RawMessage) bool {
	trimmed := bytes.TrimSpace(payload)
	return len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null"))
}
