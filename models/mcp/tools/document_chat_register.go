package tools

import (
	"context"
	"encoding/json"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func RegisterSearchDocumentsInScope(server *mcp.Server) error {
	db, err := dbclient.NewPGClient()
	if err != nil {
		return err
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "search_documents_in_scope",
		Description: "Search top-level documents within an authenticated scope using OCR text, descriptions, and metadata.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input SearchDocumentsInScopeInput) (*mcp.CallToolResult, SearchDocumentsInScopeOutput, error) {
		matches, err := searchDocumentsInScope(ctx, db, input)
		if err != nil {
			return nil, SearchDocumentsInScopeOutput{}, err
		}

		return buildToolResult(SearchDocumentsInScopeOutput{Matches: matches})
	})

	return nil
}

func RegisterBrowseDocumentsInScope(server *mcp.Server) error {
	db, err := dbclient.NewPGClient()
	if err != nil {
		return err
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "browse_documents_in_scope",
		Description: "Browse recent top-level documents within an authenticated scope using metadata, OCR text, and descriptions.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input BrowseDocumentsInScopeInput) (*mcp.CallToolResult, SearchDocumentsInScopeOutput, error) {
		matches, err := browseDocumentsInScope(ctx, db, input)
		if err != nil {
			return nil, SearchDocumentsInScopeOutput{}, err
		}

		return buildToolResult(SearchDocumentsInScopeOutput{Matches: matches})
	})

	return nil
}

func RegisterReadDocumentContext(server *mcp.Server) error {
	db, err := dbclient.NewPGClient()
	if err != nil {
		return err
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "read_document_context",
		Description: "Read normalized context for top-level documents in an authenticated scope, including metadata, OCR excerpts, and related segmentation excerpts.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input ReadDocumentContextInput) (*mcp.CallToolResult, ReadDocumentContextOutput, error) {
		documents, err := readDocumentContext(ctx, db, input)
		if err != nil {
			return nil, ReadDocumentContextOutput{}, err
		}

		return buildToolResult(ReadDocumentContextOutput{Documents: documents})
	})

	return nil
}

func buildToolResult[T any](payload T) (*mcp.CallToolResult, T, error) {
	outJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, payload, err
	}

	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
	}, payload, nil
}
