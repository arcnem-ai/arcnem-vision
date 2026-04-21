package load

import (
	"strings"
	"testing"
)

func TestLoadAgentGraphSnapshotQueryProjectsServiceExecutionFields(t *testing.T) {
	query := loadAgentGraphSnapshotQuery()

	requiredFragments := []string{
		"'organization_id', ag.organization_id",
		"'agent_graph_template_version_id', ag.agent_graph_template_version_id",
		"'tools', COALESCE(node_tools.tools, '[]'::jsonb)",
		"ORDER BY n.node_key",
		"ORDER BY e.from_node, e.to_node",
	}

	for _, fragment := range requiredFragments {
		if !strings.Contains(query, fragment) {
			t.Fatalf("query is missing required fragment %q:\n%s", fragment, query)
		}
	}

	if strings.Contains(query, "ag.archived_at IS NULL") {
		t.Fatalf("query should not exclude archived workflows:\n%s", query)
	}
}
