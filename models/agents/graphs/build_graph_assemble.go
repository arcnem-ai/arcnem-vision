package graphs

import (
	"fmt"
	"strings"
)

type supervisorInfo struct {
	snapshotNode *SnapshotNode
	result       *SupervisorRoutingResult
}

type conditionInfo struct {
	snapshotNode *SnapshotNode
	result       *ConditionRoutingResult
}

func collectRoutingNodeInfo(
	agentGraphSnapshot *Snapshot,
) (
	map[string]*supervisorInfo,
	map[string]*conditionInfo,
	map[string]string,
	error,
) {
	supervisors := make(map[string]*supervisorInfo)
	conditions := make(map[string]*conditionInfo)
	supervisorMembers := make(map[string]string)
	nodeKeys := make(map[string]struct{}, len(agentGraphSnapshot.Nodes))
	for _, node := range agentGraphSnapshot.Nodes {
		nodeKeys[node.Node.NodeKey] = struct{}{}
	}

	for _, node := range agentGraphSnapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(node.Node.NodeType))
		switch nodeType {
		case "supervisor":
			cfg, err := parseSupervisorConfig(node)
			if err != nil {
				return nil, nil, nil, err
			}
			if cfg.FinishTarget != "" {
				if _, exists := nodeKeys[cfg.FinishTarget]; !exists {
					return nil, nil, nil, fmt.Errorf(
						"supervisor node %q references unknown finish target %q",
						node.Node.NodeKey,
						cfg.FinishTarget,
					)
				}
			}
			supervisors[node.Node.NodeKey] = &supervisorInfo{snapshotNode: node}
			for _, member := range cfg.Members {
				if existing, exists := supervisorMembers[member]; exists {
					return nil, nil, nil, fmt.Errorf(
						"worker %q is a member of multiple supervisors: %q and %q",
						member,
						existing,
						node.Node.NodeKey,
					)
				}
				supervisorMembers[member] = node.Node.NodeKey
			}
		case "condition":
			cfg, err := parseConditionConfig(node)
			if err != nil {
				return nil, nil, nil, err
			}
			for _, target := range []string{cfg.TrueTarget, cfg.FalseTarget} {
				if target == "END" {
					continue
				}
				if _, exists := nodeKeys[target]; !exists {
					return nil, nil, nil, fmt.Errorf(
						"condition node %q references unknown target %q",
						node.Node.NodeKey,
						target,
					)
				}
			}
			conditions[node.Node.NodeKey] = &conditionInfo{snapshotNode: node}
		}
	}

	return supervisors, conditions, supervisorMembers, nil
}
