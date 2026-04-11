package tools

import (
	"context"
	"encoding/json"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func RegisterFindSimilarDocuments(server *mcp.Server) error {
	db, err := dbclient.NewPGClient()
	if err != nil {
		return err
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "find_similar_documents",
		Description: "Find documents with similar CLIP embeddings using cosine distance.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input FindSimilarDocumentsInput) (*mcp.CallToolResult, FindSimilarOutput, error) {
		results, err := runFindSimilarEmbeddings(
			ctx,
			db,
			"document_embeddings",
			"document_id",
			input.DocumentID,
			defaultFindSimilarLimit,
		)
		if err != nil {
			return nil, FindSimilarOutput{}, err
		}

		out := FindSimilarOutput{Matches: results}
		outJSON, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
		}, out, nil
	})

	return nil
}
