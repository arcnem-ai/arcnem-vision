package tools

import (
	"context"
	"encoding/json"
	"fmt"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"gorm.io/gorm/clause"
)

func RegisterCreateDocumentDescription(server *mcp.Server) {
	db := dbclient.NewPGClient()

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_document_description",
		Description: "Save an LLM-generated text description for a document.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input CreateDocumentDescriptionInput) (*mcp.CallToolResult, CreateDocumentDescriptionOutput, error) {
		var model dbmodels.Model
		if err := db.Where("provider = ? AND name = ?", input.ModelProvider, input.ModelName).First(&model).Error; err != nil {
			return nil, CreateDocumentDescriptionOutput{}, fmt.Errorf("failed to find model %s/%s in db: %w", input.ModelProvider, input.ModelName, err)
		}

		record := dbmodels.DocumentDescription{
			DocumentID: input.DocumentID,
			ModelID:    model.ID,
			Text:       input.Text,
		}
		if err := db.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "document_id"},
				{Name: "model_id"},
			},
			DoUpdates: clause.AssignmentColumns([]string{"text", "updated_at"}),
		}).Create(&record).Error; err != nil {
			return nil, CreateDocumentDescriptionOutput{}, fmt.Errorf("failed to save description: %w", err)
		}

		var saved dbmodels.DocumentDescription
		if err := db.Where("document_id = ? AND model_id = ?", input.DocumentID, model.ID).First(&saved).Error; err != nil {
			return nil, CreateDocumentDescriptionOutput{}, fmt.Errorf("failed to load saved description: %w", err)
		}

		out := CreateDocumentDescriptionOutput{DescriptionID: saved.ID, Text: saved.Text}
		outJSON, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
		}, out, nil
	})
}
