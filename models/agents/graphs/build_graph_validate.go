package graphs

import (
	"errors"
	"fmt"
	"strings"
)

func validateSnapshot(snapshot *Snapshot) error {
	if snapshot == nil {
		return errors.New("graph snapshot is nil")
	}
	if snapshot.AgentGraph == nil {
		return errors.New("agent graph is missing from snapshot")
	}

	entryNode, err := validateSnapshotEntryNode(snapshot)
	if err != nil {
		return err
	}

	nodeKeys, err := collectSnapshotNodeKeys(snapshot)
	if err != nil {
		return err
	}
	if _, exists := nodeKeys[entryNode]; !exists {
		return fmt.Errorf("entry node %q was not found in graph nodes", entryNode)
	}

	adjacency, err := buildSnapshotAdjacency(snapshot, nodeKeys)
	if err != nil {
		return err
	}
	if !snapshotEntryNodeReachesEnd(entryNode, adjacency, len(snapshot.Nodes)) {
		return errors.New("entry node must have a path to END")
	}

	return nil
}

func validateSnapshotEntryNode(snapshot *Snapshot) (string, error) {
	entryNode := strings.TrimSpace(snapshot.AgentGraph.EntryNode)
	if entryNode == "" {
		return "", errors.New("agent graph entry node is empty")
	}
	if snapshot.AgentGraph.EntryNode != entryNode {
		return "", errors.New("agent graph entry node cannot include leading or trailing spaces")
	}

	return entryNode, nil
}

func collectSnapshotNodeKeys(snapshot *Snapshot) (map[string]struct{}, error) {
	nodeKeys := make(map[string]struct{}, len(snapshot.Nodes))
	for index, snapshotNode := range snapshot.Nodes {
		if snapshotNode == nil || snapshotNode.Node == nil {
			return nil, fmt.Errorf("graph node at index %d is nil", index)
		}
		nodeKey := strings.TrimSpace(snapshotNode.Node.NodeKey)
		if nodeKey == "" {
			return nil, fmt.Errorf("graph node at index %d has an empty node key", index)
		}
		if snapshotNode.Node.NodeKey != nodeKey {
			return nil, fmt.Errorf("graph node %q has leading or trailing spaces", snapshotNode.Node.NodeKey)
		}
		if _, exists := nodeKeys[nodeKey]; exists {
			return nil, fmt.Errorf("duplicate graph node key %q", nodeKey)
		}
		nodeKeys[nodeKey] = struct{}{}
	}

	return nodeKeys, nil
}

func buildSnapshotAdjacency(
	snapshot *Snapshot,
	nodeKeys map[string]struct{},
) (map[string][]string, error) {
	adjacency := make(map[string][]string, len(snapshot.Edges))
	seenEdges := make(map[string]struct{}, len(snapshot.Edges))
	for index, edge := range snapshot.Edges {
		if edge == nil {
			return nil, fmt.Errorf("graph edge at index %d is nil", index)
		}

		fromNode := strings.TrimSpace(edge.FromNode)
		toNode := strings.TrimSpace(edge.ToNode)
		if fromNode == "" || toNode == "" {
			return nil, fmt.Errorf("graph edge at index %d must include from_node and to_node", index)
		}
		if edge.FromNode != fromNode || edge.ToNode != toNode {
			return nil, fmt.Errorf("graph edge %q -> %q has leading or trailing spaces", edge.FromNode, edge.ToNode)
		}
		if fromNode == toNode {
			return nil, fmt.Errorf("graph edge %q cannot point to itself", fromNode)
		}
		if _, exists := nodeKeys[fromNode]; !exists {
			return nil, fmt.Errorf("graph edge %q -> %q references unknown source node", fromNode, toNode)
		}
		if toNode != "END" {
			if _, exists := nodeKeys[toNode]; !exists {
				return nil, fmt.Errorf("graph edge %q -> %q references unknown target node", fromNode, toNode)
			}
		}

		edgeKey := fmt.Sprintf("%s->%s", fromNode, toNode)
		if _, exists := seenEdges[edgeKey]; exists {
			return nil, fmt.Errorf("duplicate graph edge %q", edgeKey)
		}
		seenEdges[edgeKey] = struct{}{}

		adjacency[fromNode] = append(adjacency[fromNode], toNode)
	}

	return addImplicitRoutingAdjacency(snapshot, adjacency), nil
}

func addImplicitRoutingAdjacency(
	snapshot *Snapshot,
	adjacency map[string][]string,
) map[string][]string {
	for _, snapshotNode := range snapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(snapshotNode.Node.NodeType))
		switch nodeType {
		case "supervisor":
			cfg, err := parseSupervisorConfig(snapshotNode)
			if err != nil {
				continue
			}
			supKey := snapshotNode.Node.NodeKey
			for _, member := range cfg.Members {
				adjacency[supKey] = append(adjacency[supKey], member)
				adjacency[member] = append(adjacency[member], supKey)
			}
			if cfg.FinishTarget != "" {
				adjacency[supKey] = append(adjacency[supKey], cfg.FinishTarget)
			} else {
				adjacency[supKey] = append(adjacency[supKey], "END")
			}
		case "condition":
			cfg, err := parseConditionConfig(snapshotNode)
			if err != nil {
				continue
			}
			adjacency[snapshotNode.Node.NodeKey] = append(
				adjacency[snapshotNode.Node.NodeKey],
				cfg.TrueTarget,
				cfg.FalseTarget,
			)
		}
	}

	return adjacency
}

func snapshotEntryNodeReachesEnd(
	entryNode string,
	adjacency map[string][]string,
	nodeCount int,
) bool {
	visited := make(map[string]struct{}, nodeCount)
	queue := []string{entryNode}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if _, seen := visited[current]; seen {
			continue
		}
		visited[current] = struct{}{}

		for _, next := range adjacency[current] {
			if next == "END" {
				return true
			}
			if _, seen := visited[next]; !seen {
				queue = append(queue, next)
			}
		}
	}

	return false
}
