package graphs

import (
	"errors"
	"fmt"
	"strings"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
)

// BuildGraphNode dispatches to the appropriate builder based on node type.
// Supervisor nodes are handled separately by BuildGraph (not through this function).
func BuildGraphNode(
	node *SnapshotNode,
	modelClient any,
	mcpClient *clients.MCPClient,
) (*NodeToAdd, error) {
	if node == nil {
		return nil, errors.New("node is nil in build function")
	}
	if node.Node == nil {
		return nil, errors.New("node metadata is nil in build function")
	}

	switch strings.ToLower(strings.TrimSpace(node.Node.NodeType)) {
	case "worker":
		return BuildWorkerNode(node, modelClient, mcpClient)
	case "tool":
		return BuildToolNode(node, mcpClient)
	case "supervisor":
		return nil, fmt.Errorf("supervisor node %q must be built via BuildSupervisorRoutingNode, not BuildGraphNode", node.Node.NodeKey)
	default:
		return nil, fmt.Errorf("unknown node type %q", node.Node.NodeType)
	}
}
