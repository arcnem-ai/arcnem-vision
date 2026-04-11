package graphs

import (
	"fmt"
	"strings"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/smallnest/langgraphgo/graph"
)

func buildModelClients(
	agentGraphSnapshot *Snapshot,
	newModelClient modelClientFactory,
) (map[string]any, error) {
	modelClients := make(map[string]any)
	for _, node := range agentGraphSnapshot.Nodes {
		if node.Model == nil {
			continue
		}

		key := fmt.Sprintf(
			"%s:%s:%s",
			node.Model.Provider,
			node.Model.Name,
			node.Model.Version,
		)
		if _, ok := modelClients[key]; ok {
			continue
		}

		client, err := newModelClient(
			node.Model.Provider,
			node.Model.Name,
			node.Model.Version,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create model client for %s: %w", key, err)
		}

		modelClients[key] = client
	}

	return modelClients, nil
}

func buildWorkerAndToolNodes(
	agentGraphSnapshot *Snapshot,
	mcpClient *clients.MCPClient,
	modelClients map[string]any,
	supervisorMembers map[string]string,
) (map[string]*NodeToAdd, error) {
	builtNodes := make(map[string]*NodeToAdd)
	for _, node := range agentGraphSnapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(node.Node.NodeType))
		if nodeType == "supervisor" || nodeType == "condition" {
			continue
		}

		modelClient := graphNodeModelClient(node, modelClients)
		if _, isMember := supervisorMembers[node.Node.NodeKey]; isMember && nodeType == "worker" {
			built, err := BuildSupervisorMemberWorkerNode(node, modelClient, mcpClient)
			if err != nil {
				return nil, fmt.Errorf(
					"failed to build member worker %q: %w",
					node.Node.NodeKey,
					err,
				)
			}
			builtNodes[node.Node.NodeKey] = built
			continue
		}

		built, err := BuildGraphNode(node, modelClient, mcpClient)
		if err != nil {
			return nil, fmt.Errorf(
				"failed to build node %q: %w",
				node.Node.NodeKey,
				err,
			)
		}
		builtNodes[node.Node.NodeKey] = built
	}

	return builtNodes, nil
}

func buildRoutingNodes(
	agentGraphSnapshot *Snapshot,
	modelClients map[string]any,
	builtNodes map[string]*NodeToAdd,
	supervisors map[string]*supervisorInfo,
	conditions map[string]*conditionInfo,
) error {
	for _, node := range agentGraphSnapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(node.Node.NodeType))
		switch nodeType {
		case "supervisor":
			result, err := BuildSupervisorRoutingNode(node, graphNodeModelClient(node, modelClients))
			if err != nil {
				return fmt.Errorf(
					"failed to build supervisor %q: %w",
					node.Node.NodeKey,
					err,
				)
			}
			builtNodes[node.Node.NodeKey] = result.RoutingNode
			supervisors[node.Node.NodeKey].result = result
		case "condition":
			result, err := BuildConditionNode(node)
			if err != nil {
				return fmt.Errorf(
					"failed to build condition node %q: %w",
					node.Node.NodeKey,
					err,
				)
			}
			builtNodes[node.Node.NodeKey] = result.Node
			conditions[node.Node.NodeKey].result = result
		}
	}

	return nil
}

func addBuiltNodesToGraph(
	g *graph.StateGraph[map[string]any],
	builtNodes map[string]*NodeToAdd,
	supervisors map[string]*supervisorInfo,
	supervisorMembers map[string]string,
) {
	for key, built := range builtNodes {
		if _, isSupervisor := supervisors[key]; isSupervisor {
			info := supervisors[key]
			g.AddNodeWithTimeout(
				built.Name,
				built.Description,
				built.Fn,
				info.result.RoutingTimeout,
			)
			continue
		}

		if _, isMember := supervisorMembers[key]; isMember {
			g.AddNodeWithTimeout(
				built.Name,
				built.Description,
				built.Fn,
				defaultMemberWorkerTimeout,
			)
			continue
		}

		g.AddNode(built.Name, built.Description, built.Fn)
	}
}

func graphNodeModelClient(snapshotNode *SnapshotNode, modelClients map[string]any) any {
	if snapshotNode.Model == nil {
		return nil
	}

	key := fmt.Sprintf(
		"%s:%s:%s",
		snapshotNode.Model.Provider,
		snapshotNode.Model.Name,
		snapshotNode.Model.Version,
	)

	return modelClients[key]
}
