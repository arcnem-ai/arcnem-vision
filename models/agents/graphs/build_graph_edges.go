package graphs

import "github.com/smallnest/langgraphgo/graph"

func wireGraphEdges(
	g *graph.StateGraph[map[string]any],
	agentGraphSnapshot *Snapshot,
	supervisors map[string]*supervisorInfo,
	conditions map[string]*conditionInfo,
) {
	g.SetEntryPoint(agentGraphSnapshot.AgentGraph.EntryNode)

	for supervisorKey, info := range supervisors {
		g.AddConditionalEdge(supervisorKey, info.result.ConditionalEdgeFn)
		for _, member := range info.result.Members {
			g.AddEdge(member, supervisorKey)
		}
	}

	for key, info := range conditions {
		g.AddConditionalEdge(key, info.result.ConditionalEdgeFn)
	}

	for _, edge := range agentGraphSnapshot.Edges {
		if _, isSupervisor := supervisors[edge.FromNode]; isSupervisor {
			continue
		}
		if _, isCondition := conditions[edge.FromNode]; isCondition {
			continue
		}

		if edge.ToNode == "END" {
			g.AddEdge(edge.FromNode, graph.END)
			continue
		}

		g.AddEdge(edge.FromNode, edge.ToNode)
	}
}
