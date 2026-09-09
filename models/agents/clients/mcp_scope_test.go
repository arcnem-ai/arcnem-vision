package clients

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"gorm.io/gorm"
	gormtests "gorm.io/gorm/utils/tests"
)

func TestMCPExecutionScopeRejectsForeignArgumentsBeforeCallingTools(t *testing.T) {
	db, err := gorm.Open(gormtests.DummyDialector{}, &gorm.Config{DryRun: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Callback().Query().Replace("gorm:query", func(tx *gorm.DB) {
		query := tx.Statement.SQL.String()
		for _, required := range []string{"WITH RECURSIVE", "organization_id =", "project_id =", "segmentation.source_document_id", "segmentation.segmented_document_id"} {
			if !strings.Contains(query, required) {
				t.Errorf("scope query missing %s", required)
			}
		}
		if !reflect.DeepEqual(tx.Statement.Vars, []any{"root-document", "org-1", "project-1", "org-1", "project-1"}) {
			t.Errorf("unexpected trusted scope parameters: %#v", tx.Statement.Vars)
		}
		descriptionID := "derived-description"
		*tx.Statement.Dest.(*[]authorizedMCPDocument) = []authorizedMCPDocument{
			{DocumentID: "root-document"},
			{DocumentID: "derived-document", DescriptionID: &descriptionID, Bucket: "scope-bucket", ObjectKey: "derived/image.png"},
		}
		tx.RowsAffected = 2
	}); err != nil {
		t.Fatal(err)
	}

	server := mcp.NewServer(&mcp.Implementation{Name: "scope-test", Version: "1"}, nil)
	received := make(chan map[string]any, 4)
	for _, name := range []string{"create_document_description", "create_description_embedding", "read_document_context", "create_document_embedding"} {
		mcp.AddTool(server, &mcp.Tool{Name: name}, func(_ context.Context, _ *mcp.CallToolRequest, args map[string]any) (*mcp.CallToolResult, map[string]any, error) {
			received <- args
			return nil, map[string]any{"ok": true}, nil
		})
	}
	httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true}))
	defer httpServer.Close()
	client := &MCPClient{client: mcp.NewClient(&mcp.Implementation{Name: "scope-client", Version: "1"}, nil), endpoint: httpServer.URL}
	for key, value := range map[string]string{
		"S3_ACCESS_KEY_ID": "test", "S3_SECRET_ACCESS_KEY": "test", "S3_BUCKET": "scope-bucket",
		"S3_ENDPOINT": "https://storage.example.com", "S3_REGION": "auto", "S3_USE_PATH_STYLE": "true",
	} {
		t.Setenv(key, value)
	}
	s3, err := NewS3Client(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	roots := []string{"root-document"}
	ctx := ContextWithMCPExecutionScope(context.Background(), db, s3, "org-1", "project-1", roots)
	roots[0] = "foreign-document"

	for _, attempt := range []struct {
		name string
		args map[string]any
	}{
		{"create_document_description", map[string]any{"document_id": "foreign-document", "text": "overwrite foreign document"}},
		{"create_description_embedding", map[string]any{"document_description_id": "foreign-description"}},
		{"read_document_context", map[string]any{"document_ids": []string{"foreign-document"}}},
		{"search_documents_in_scope", map[string]any{"scope": map[string]any{"document_ids": []string{"foreign-document"}}}},
		{"future_unreviewed_tool", map[string]any{}},
	} {
		if _, err := client.CallTool(ctx, attempt.name, attempt.args); err == nil {
			t.Fatalf("accepted unauthorized %s", attempt.name)
		}
	}
	if _, err := client.CallTool(context.Background(), "create_document_description", map[string]any{"document_id": "root-document"}); err == nil {
		t.Fatal("accepted missing trusted context")
	}
	if len(received) != 0 {
		t.Fatal("unauthorized arguments reached the MCP server")
	}

	for _, attempt := range []struct {
		name string
		args map[string]any
	}{
		{"create_document_description", map[string]any{"document_id": "derived-document", "text": "legitimate derived review"}},
		{"create_description_embedding", map[string]any{"document_description_id": "derived-description"}},
	} {
		if result, err := client.CallTool(ctx, attempt.name, attempt.args); err != nil || result.IsError {
			t.Fatalf("valid derived call failed: %v %#v", err, result)
		}
		<-received
	}
	args := map[string]any{
		"document_ids": []string{"root-document"},
		"scope":        map[string]any{"organization_id": "foreign-org", "project_ids": []string{"foreign-project"}},
	}
	if result, err := client.CallTool(ctx, "read_document_context", args); err != nil || result.IsError {
		t.Fatalf("scoped call failed: %v %#v", err, result)
	}
	actual := <-received
	wantScope := map[string]any{"organization_id": "org-1", "project_ids": []any{"project-1"}, "document_ids": []any{"root-document"}}
	if !reflect.DeepEqual(actual["scope"], wantScope) {
		t.Fatalf("caller scope not replaced: %#v", actual["scope"])
	}
	if args["scope"].(map[string]any)["organization_id"] != "foreign-org" {
		t.Fatal("mutated caller state")
	}
	if _, err := client.CallTool(ctx, "create_document_embedding", map[string]any{
		"document_id": "derived-document", "temp_url": "http://127.0.0.1/internal",
	}); err != nil {
		t.Fatal(err)
	}
	actual = <-received
	imageURL, err := url.Parse(actual["temp_url"].(string))
	if err != nil || imageURL.Host != "storage.example.com" || imageURL.Path != "/scope-bucket/derived/image.png" {
		t.Fatalf("image source was not bound to authorized storage: %v", err)
	}
}
