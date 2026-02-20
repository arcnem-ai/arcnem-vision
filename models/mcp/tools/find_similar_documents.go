package tools

import (
	"context"
	"encoding/json"
	"fmt"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func RegisterFindSimilarDocuments(server *mcp.Server) {
	db := dbclient.NewPGClient()

	mcp.AddTool(server, &mcp.Tool{
		Name:        "find_similar_documents",
		Description: "Find documents with similar CLIP embeddings using cosine distance.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input FindSimilarDocumentsInput) (*mcp.CallToolResult, FindSimilarOutput, error) {
		var results []SimilarMatch
		err := db.Raw(`
			SELECT de2.document_id AS id, de2.embedding <=> de1.embedding AS distance
			FROM document_embeddings de1
			JOIN document_embeddings de2 ON de2.document_id != de1.document_id
			WHERE de1.document_id = ?
			ORDER BY distance
			LIMIT ?
		`, input.DocumentID, 5).Scan(&results).Error
		if err != nil {
			return nil, FindSimilarOutput{}, fmt.Errorf("similarity query failed: %w", err)
		}

		out := FindSimilarOutput{Matches: results}
		outJSON, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
		}, out, nil
	})
}
