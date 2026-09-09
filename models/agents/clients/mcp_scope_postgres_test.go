package clients

import (
	"context"
	"os"
	"reflect"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// MCP_SCOPE_DATABASE_URL enables the real PostgreSQL check. Temporary tables
// shadow the application tables only in this rollback transaction.
func TestMCPExecutionScopePostgres(t *testing.T) {
	dsn := os.Getenv("MCP_SCOPE_DATABASE_URL")
	if dsn == "" {
		t.Skip("set MCP_SCOPE_DATABASE_URL to run the PostgreSQL scope check")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	for _, statement := range []string{
		"SET LOCAL statement_timeout = '5s'",
		"CREATE TEMP TABLE documents (id uuid PRIMARY KEY, organization_id uuid, project_id uuid, bucket text, object_key text) ON COMMIT DROP",
		"CREATE TEMP TABLE document_descriptions (id uuid PRIMARY KEY, document_id uuid) ON COMMIT DROP",
		"CREATE TEMP TABLE document_segmentations (source_document_id uuid, segmented_document_id uuid) ON COMMIT DROP",
	} {
		if err := tx.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	const org = "019f1111-1111-7111-8111-111111111111"
	const project = "019f2222-2222-7222-8222-222222222222"
	const other = "019f9999-9999-7999-8999-999999999999"
	ids := []string{
		"019f0000-0000-7000-8000-000000000001",
		"019f0000-0000-7000-8000-000000000002",
		"019f0000-0000-7000-8000-000000000003",
		"019f0000-0000-7000-8000-000000000004",
		"019f0000-0000-7000-8000-000000000005",
		"019f0000-0000-7000-8000-000000000006",
	}
	for i, id := range ids {
		rowOrg, rowProject := org, project
		if i == 3 {
			rowOrg, rowProject = other, other
		}
		if i == 4 {
			rowProject = other
		}
		if err := tx.Exec("INSERT INTO documents VALUES (?, ?, ?, 'test-bucket', 'test.png')", id, rowOrg, rowProject).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, link := range [][2]int{{0, 1}, {1, 2}, {2, 0}, {0, 3}, {0, 4}} {
		if err := tx.Exec("INSERT INTO document_segmentations VALUES (?, ?)", ids[link[0]], ids[link[1]]).Error; err != nil {
			t.Fatal(err)
		}
	}
	const childDescription = "019f0000-0000-7000-8000-000000000007"
	const foreignDescription = "019f0000-0000-7000-8000-000000000008"
	if err := tx.Exec("INSERT INTO document_descriptions VALUES (?, ?), (?, ?)", childDescription, ids[2], foreignDescription, ids[3]).Error; err != nil {
		t.Fatal(err)
	}
	ctx := ContextWithMCPExecutionScope(context.Background(), tx, nil, org, project, ids[:1])
	for _, id := range ids[:3] {
		if _, err := authorizeMCPToolCall(ctx, "create_document_description", map[string]any{"document_id": id}); err != nil {
			t.Fatalf("selected root/descendant rejected: %v", err)
		}
	}
	for _, id := range ids[3:] {
		if _, err := authorizeMCPToolCall(ctx, "create_document_description", map[string]any{"document_id": id}); err == nil {
			t.Fatal("foreign, other-project, or unselected document accepted")
		}
	}
	if _, err := authorizeMCPToolCall(ctx, "create_description_embedding", map[string]any{"document_description_id": childDescription}); err != nil {
		t.Fatal(err)
	}
	if _, err := authorizeMCPToolCall(ctx, "create_description_embedding", map[string]any{"document_description_id": foreignDescription}); err == nil {
		t.Fatal("foreign description accepted")
	}
	guarded, err := authorizeMCPToolCall(ctx, "read_document_context", map[string]any{
		"document_ids": []string{ids[0]}, "scope": map[string]any{"organization_id": other, "project_ids": []string{other}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(guarded["scope"], map[string]any{"organization_id": org, "project_ids": []string{project}, "document_ids": ids[:1]}) {
		t.Fatal("caller scope was not replaced")
	}
}
