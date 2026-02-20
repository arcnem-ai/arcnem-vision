package graphs

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/smallnest/langgraphgo/graph"
)

func validateSnapshot(snapshot *Snapshot) error {
	if snapshot == nil {
		return errors.New("graph snapshot is nil")
	}
	if snapshot.AgentGraph == nil {
		return errors.New("agent graph is missing from snapshot")
	}

	entryNode := strings.TrimSpace(snapshot.AgentGraph.EntryNode)
	if entryNode == "" {
		return errors.New("agent graph entry node is empty")
	}
	if snapshot.AgentGraph.EntryNode != entryNode {
		return errors.New("agent graph entry node cannot include leading or trailing spaces")
	}

	nodeKeys := make(map[string]struct{}, len(snapshot.Nodes))
	for index, snapshotNode := range snapshot.Nodes {
		if snapshotNode == nil || snapshotNode.Node == nil {
			return fmt.Errorf("graph node at index %d is nil", index)
		}
		nodeKey := strings.TrimSpace(snapshotNode.Node.NodeKey)
		if nodeKey == "" {
			return fmt.Errorf("graph node at index %d has an empty node key", index)
		}
		if snapshotNode.Node.NodeKey != nodeKey {
			return fmt.Errorf("graph node %q has leading or trailing spaces", snapshotNode.Node.NodeKey)
		}
		if _, exists := nodeKeys[nodeKey]; exists {
			return fmt.Errorf("duplicate graph node key %q", nodeKey)
		}
		nodeKeys[nodeKey] = struct{}{}
	}

	if _, exists := nodeKeys[entryNode]; !exists {
		return fmt.Errorf("entry node %q was not found in graph nodes", entryNode)
	}

	// Build adjacency from DB edges.
	seenEdges := make(map[string]struct{}, len(snapshot.Edges))
	adjacency := make(map[string][]string, len(snapshot.Edges))
	for index, edge := range snapshot.Edges {
		if edge == nil {
			return fmt.Errorf("graph edge at index %d is nil", index)
		}

		fromNode := strings.TrimSpace(edge.FromNode)
		toNode := strings.TrimSpace(edge.ToNode)
		if fromNode == "" || toNode == "" {
			return fmt.Errorf("graph edge at index %d must include from_node and to_node", index)
		}
		if edge.FromNode != fromNode || edge.ToNode != toNode {
			return fmt.Errorf("graph edge %q -> %q has leading or trailing spaces", edge.FromNode, edge.ToNode)
		}
		if fromNode == toNode {
			return fmt.Errorf("graph edge %q cannot point to itself", fromNode)
		}
		if _, exists := nodeKeys[fromNode]; !exists {
			return fmt.Errorf("graph edge %q -> %q references unknown source node", fromNode, toNode)
		}
		if toNode != "END" {
			if _, exists := nodeKeys[toNode]; !exists {
				return fmt.Errorf("graph edge %q -> %q references unknown target node", fromNode, toNode)
			}
		}

		edgeKey := fmt.Sprintf("%s->%s", fromNode, toNode)
		if _, exists := seenEdges[edgeKey]; exists {
			return fmt.Errorf("duplicate graph edge %q", edgeKey)
		}
		seenEdges[edgeKey] = struct{}{}

		next := adjacency[fromNode]
		next = append(next, toNode)
		adjacency[fromNode] = next
	}

	// Synthesize supervisor edges into the adjacency map for reachability checks.
	// Supervisor nodes auto-wire: supervisor -> each member, each member -> supervisor, supervisor -> END.
	for _, snapshotNode := range snapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(snapshotNode.Node.NodeType))
		if nodeType != "supervisor" {
			continue
		}
		var cfg struct {
			Members []string `json:"members"`
		}
		if err := json.Unmarshal([]byte(snapshotNode.Node.Config), &cfg); err != nil {
			continue // Config validation happens later in BuildGraph.
		}
		supKey := snapshotNode.Node.NodeKey
		for _, member := range cfg.Members {
			adjacency[supKey] = append(adjacency[supKey], member)
			adjacency[member] = append(adjacency[member], supKey)
		}
		adjacency[supKey] = append(adjacency[supKey], "END")
	}

	// Ensure the configured entry point can reach END.
	visited := make(map[string]struct{}, len(snapshot.Nodes))
	queue := []string{entryNode}
	reachesEnd := false
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if _, seen := visited[current]; seen {
			continue
		}
		visited[current] = struct{}{}

		for _, next := range adjacency[current] {
			if next == "END" {
				reachesEnd = true
				break
			}
			if _, seen := visited[next]; !seen {
				queue = append(queue, next)
			}
		}
		if reachesEnd {
			break
		}
	}

	if !reachesEnd {
		return errors.New("entry node must have a path to END")
	}

	return nil
}

func BuildGraph(agentGraphSnapshot *Snapshot, mcpClient *clients.MCPClient) (*graph.StateRunnable[map[string]any], error) {
	if err := validateSnapshot(agentGraphSnapshot); err != nil {
		return nil, fmt.Errorf("invalid graph snapshot: %w", err)
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

	// Collect supervisor info before building nodes so we know which workers
	// are supervisor members and need special handling.
	type supervisorInfo struct {
		snapshotNode *SnapshotNode
		result       *SupervisorRoutingResult
	}
	supervisors := make(map[string]*supervisorInfo)
	supervisorMembers := make(map[string]string) // member key -> supervisor key

	for _, node := range agentGraphSnapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(node.Node.NodeType))
		if nodeType != "supervisor" {
			continue
		}
		cfg, err := parseSupervisorConfig(node)
		if err != nil {
			return nil, err
		}
		supervisors[node.Node.NodeKey] = &supervisorInfo{snapshotNode: node}
		for _, member := range cfg.Members {
			if existingSupervisor, exists := supervisorMembers[member]; exists {
				return nil, fmt.Errorf("worker %q is a member of multiple supervisors: %q and %q", member, existingSupervisor, node.Node.NodeKey)
			}
			supervisorMembers[member] = node.Node.NodeKey
		}
	}

	// If any supervisor exists, auto-register the message AppendReducer
	// so workers and supervisors can share conversation history.
	if len(supervisors) > 0 {
		schema.RegisterReducer("messages", graph.AppendReducer)
	}
	g.SetSchema(schema)

	// Deduplicate model clients by provider:model.
	modelClients := make(map[string]any)
	for _, node := range agentGraphSnapshot.Nodes {
		if node.Model == nil {
			continue
		}
		key := fmt.Sprintf("%s:%s", node.Model.Provider, node.Model.Name)
		if _, ok := modelClients[key]; ok {
			continue
		}
		client, err := clients.NewModelClient(node.Model.Provider, node.Model.Name)
		if err != nil {
			return nil, fmt.Errorf("failed to create model client for %s: %w", key, err)
		}
		modelClients[key] = client
	}

	// Two-pass build: workers and tool nodes first, then supervisors.
	builtNodes := make(map[string]*NodeToAdd)

	// Pass 1: build worker and tool nodes.
	for _, node := range agentGraphSnapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(node.Node.NodeType))
		if nodeType == "supervisor" {
			continue
		}

		var modelClient any
		if node.Model != nil {
			key := fmt.Sprintf("%s:%s", node.Model.Provider, node.Model.Name)
			modelClient = modelClients[key]
		}

		// If this worker is a supervisor member, build it with the member adapter.
		if _, isMember := supervisorMembers[node.Node.NodeKey]; isMember && nodeType == "worker" {
			built, err := BuildSupervisorMemberWorkerNode(node, modelClient, mcpClient)
			if err != nil {
				return nil, fmt.Errorf("failed to build member worker %q: %w", node.Node.NodeKey, err)
			}
			builtNodes[node.Node.NodeKey] = built
		} else {
			built, err := BuildGraphNode(node, modelClient, mcpClient)
			if err != nil {
				return nil, fmt.Errorf("failed to build node %q: %w", node.Node.NodeKey, err)
			}
			builtNodes[node.Node.NodeKey] = built
		}
	}

	// Pass 2: build supervisor routing nodes.
	for _, node := range agentGraphSnapshot.Nodes {
		nodeType := strings.ToLower(strings.TrimSpace(node.Node.NodeType))
		if nodeType != "supervisor" {
			continue
		}

		var modelClient any
		if node.Model != nil {
			key := fmt.Sprintf("%s:%s", node.Model.Provider, node.Model.Name)
			modelClient = modelClients[key]
		}

		result, err := BuildSupervisorRoutingNode(node, modelClient)
		if err != nil {
			return nil, fmt.Errorf("failed to build supervisor %q: %w", node.Node.NodeKey, err)
		}
		builtNodes[node.Node.NodeKey] = result.RoutingNode
		supervisors[node.Node.NodeKey].result = result
	}

	// Add all nodes to the graph, with timeouts for supervisor participants.
	for key, built := range builtNodes {
		if _, isSupervisor := supervisors[key]; isSupervisor {
			info := supervisors[key]
			g.AddNodeWithTimeout(built.Name, built.Description, built.Fn, info.result.RoutingTimeout)
		} else if supKey, isMember := supervisorMembers[key]; isMember {
			_ = supKey
			g.AddNodeWithTimeout(built.Name, built.Description, built.Fn, defaultMemberWorkerTimeout)
		} else {
			g.AddNode(built.Name, built.Description, built.Fn)
		}
	}

	// Wire edges.
	g.SetEntryPoint(agentGraphSnapshot.AgentGraph.EntryNode)

	// Wire supervisor conditional edges and member->supervisor static edges.
	for supKey, info := range supervisors {
		g.AddConditionalEdge(supKey, info.result.ConditionalEdgeFn)
		for _, member := range info.result.Members {
			g.AddEdge(member, supKey)
		}
	}

	// Wire non-supervisor DB edges as static edges. Skip edges from supervisor nodes
	// (their routing is handled by conditional edges above).
	for _, edge := range agentGraphSnapshot.Edges {
		if _, isSupervisor := supervisors[edge.FromNode]; isSupervisor {
			continue
		}
		if edge.ToNode == "END" {
			g.AddEdge(edge.FromNode, graph.END)
		} else {
			g.AddEdge(edge.FromNode, edge.ToNode)
		}
	}

	return g.Compile()
}
