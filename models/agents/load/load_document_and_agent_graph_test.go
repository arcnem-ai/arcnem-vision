package load

import (
	"encoding/json"
	"strings"
	"testing"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/google/uuid"
)

func TestDecodePinnedWorkflowSnapshotRowUsesAcceptedContent(t *testing.T) {
	executionID := uuid.MustParse("55555555-5555-5555-5555-555555555555")
	hash := strings.Repeat("a", 64)
	snapshot, err := decodePinnedWorkflowSnapshotRow(
		executionID,
		workflowExecutionSnapshotRow{
			GraphSnapshot: json.RawMessage(`{
				"agent_graph": {
					"id": "22222222-2222-2222-2222-222222222222",
					"name": "Accepted workflow",
					"description": null,
					"entry_node": "inspect",
					"state_schema": null,
					"agent_graph_template_id": null,
					"agent_graph_template_version_id": null,
					"organization_id": "11111111-1111-1111-1111-111111111111"
				},
				"nodes": [],
				"edges": []
			}`),
			GraphSnapshotHash: &hash,
		},
	)
	if err != nil {
		t.Fatalf("decodePinnedWorkflowSnapshotRow returned error: %v", err)
	}
	if snapshot.AgentGraph == nil || snapshot.AgentGraph.Name != "Accepted workflow" {
		t.Fatalf("unexpected pinned snapshot: %#v", snapshot)
	}
}

func TestDecodePinnedWorkflowSnapshotRowRejectsMissingProvenance(t *testing.T) {
	executionID := uuid.MustParse("66666666-6666-6666-6666-666666666666")
	_, err := decodePinnedWorkflowSnapshotRow(executionID, workflowExecutionSnapshotRow{})
	if err == nil || !strings.Contains(err.Error(), "no pinned graph snapshot") {
		t.Fatalf("expected missing snapshot error, got %v", err)
	}
}

func TestLoadDocumentAndAgentGraphQueryUsesTemplateVersionID(t *testing.T) {
	query := loadDocumentAndAgentGraphQuery("LEFT JOIN agent_graphs ag ON ag.id = dev.agent_graph_id")

	if strings.Contains(query, "'agent_graph_template_version', ag.agent_graph_template_version") {
		t.Fatalf("query still references removed agent_graph_template_version column:\n%s", query)
	}

	if !strings.Contains(query, "'agent_graph_template_version_id', ag.agent_graph_template_version_id") {
		t.Fatalf("query does not project agent_graph_template_version_id:\n%s", query)
	}
}

func TestDocumentAndAgentGraphQuerySpecDoesNotFilterArchivedWorkflows(t *testing.T) {
	documentID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	workflowID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	defaultSpec := buildDocumentAndAgentGraphQuerySpec(documentID, nil)
	if strings.Contains(defaultSpec.graphJoin, "ag.archived_at IS NULL") {
		t.Fatalf("default query spec should not exclude archived workflows:\n%s", defaultSpec.graphJoin)
	}

	explicitSpec := buildDocumentAndAgentGraphQuerySpec(documentID, &workflowID)
	if strings.Contains(explicitSpec.graphJoin, "ag.archived_at IS NULL") {
		t.Fatalf("explicit workflow query spec should not exclude archived workflows:\n%s", explicitSpec.graphJoin)
	}
}

func TestOrderWorkflowDocumentsPreservesRequestedOrder(t *testing.T) {
	firstID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	secondID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	ordered, err := orderWorkflowDocuments(
		[]uuid.UUID{secondID, firstID},
		[]*dbmodels.Document{
			{ID: firstID.String(), OrganizationID: "org-1"},
			{ID: secondID.String(), OrganizationID: "org-1"},
		},
		"org-1",
	)
	if err != nil {
		t.Fatalf("orderWorkflowDocuments returned error: %v", err)
	}

	if len(ordered) != 2 {
		t.Fatalf("expected two documents, got %d", len(ordered))
	}
	if ordered[0].ID != secondID.String() || ordered[1].ID != firstID.String() {
		t.Fatalf("expected documents to match requested order, got %#v", ordered)
	}
}

func TestOrderWorkflowDocumentsRejectsMissingDocuments(t *testing.T) {
	missingID := uuid.MustParse("33333333-3333-3333-3333-333333333333")

	_, err := orderWorkflowDocuments(
		[]uuid.UUID{missingID},
		nil,
		"org-1",
	)
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected missing document error, got %v", err)
	}
}

func TestOrderWorkflowDocumentsRejectsOrganizationMismatches(t *testing.T) {
	documentID := uuid.MustParse("44444444-4444-4444-4444-444444444444")

	_, err := orderWorkflowDocuments(
		[]uuid.UUID{documentID},
		[]*dbmodels.Document{
			{ID: documentID.String(), OrganizationID: "org-2"},
		},
		"org-1",
	)
	if err == nil || !strings.Contains(err.Error(), "does not belong to workflow organization") {
		t.Fatalf("expected organization mismatch error, got %v", err)
	}
}
