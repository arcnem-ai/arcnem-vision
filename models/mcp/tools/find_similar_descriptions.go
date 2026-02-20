package tools

import (
	"context"
	"encoding/json"
	"fmt"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func RegisterFindSimilarDescriptions(server *mcp.Server) {
	db := dbclient.NewPGClient()

	mcp.AddTool(server, &mcp.Tool{
		Name:        "find_similar_descriptions",
		Description: "Find document descriptions with similar CLIP embeddings using cosine distance.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input FindSimilarDescriptionsInput) (*mcp.CallToolResult, FindSimilarOutput, error) {
		var results []SimilarMatch
		err := db.Raw(`
			SELECT dde2.document_description_id AS id, dde2.embedding <=> dde1.embedding AS distance
			FROM document_description_embeddings dde1
			JOIN document_description_embeddings dde2 ON dde2.document_description_id != dde1.document_description_id
			WHERE dde1.document_description_id = ?
			ORDER BY distance
			LIMIT ?
		`, input.DocumentDescriptionID, 5).Scan(&results).Error
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
