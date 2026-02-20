package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"gorm.io/gorm/clause"
)

func RegisterCreateDescriptionEmbedding(server *mcp.Server) {
	db := dbclient.NewPGClient()

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_description_embedding",
		Description: "Generate a CLIP text embedding for a document description and save it to the database.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input CreateDescriptionEmbeddingInput) (*mcp.CallToolResult, CreateDescriptionEmbeddingOutput, error) {
		startedAt := time.Now()

		var model dbmodels.Model
		if err := db.Where("provider = ? AND name = ?", "REPLICATE", "openai/clip").First(&model).Error; err != nil {
			return nil, CreateDescriptionEmbeddingOutput{}, fmt.Errorf("failed to find CLIP model in db: %w", err)
		}

		usedText := buildClipTextCandidate(input.Text)
		if usedText == "" {
			return nil, CreateDescriptionEmbeddingOutput{}, fmt.Errorf(
				"replicate CLIP failed for document_description_id=%s text_len=%d: normalized text is empty",
				input.DocumentDescriptionID,
				len(input.Text),
			)
		}

		runStartedAt := time.Now()
		output, err := runCLIPPrediction(ctx, map[string]any{
			"text": usedText,
		})
		runDuration := time.Since(runStartedAt)
		if err != nil {
			return nil, CreateDescriptionEmbeddingOutput{}, fmt.Errorf(
				"replicate CLIP failed for document_description_id=%s text_len=%d normalized_text_len=%d run_duration_ms=%d total_duration_ms=%d: %w",
				input.DocumentDescriptionID,
				len(input.Text),
				len(usedText),
				runDuration.Milliseconds(),
				time.Since(startedAt).Milliseconds(),
				err,
			)
		}
		if usedText != input.Text {
			log.Printf(
				"replicate clip text normalized document_description_id=%s original_len=%d used_len=%d",
				input.DocumentDescriptionID,
				len(input.Text),
				len(usedText),
			)
		}
		log.Printf(
			"replicate clip text success document_description_id=%s run_duration_ms=%d total_duration_ms=%d",
			input.DocumentDescriptionID,
			runDuration.Milliseconds(),
			time.Since(startedAt).Milliseconds(),
		)

		embedding, err := parseEmbedding(output)
		if err != nil {
			return nil, CreateDescriptionEmbeddingOutput{}, fmt.Errorf("failed to parse embedding: %w", err)
		}

		record := dbmodels.DocumentDescriptionEmbedding{
			DocumentDescriptionID: input.DocumentDescriptionID,
			ModelID:               model.ID,
			EmbeddingDim:          clipEmbeddingDim,
			Embedding:             embedding,
		}
		if err := db.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "document_description_id"},
				{Name: "model_id"},
				{Name: "embedding_dim"},
			},
			DoUpdates: clause.AssignmentColumns([]string{"embedding", "updated_at"}),
		}).Create(&record).Error; err != nil {
			return nil, CreateDescriptionEmbeddingOutput{}, fmt.Errorf("failed to save embedding: %w", err)
		}

		var saved dbmodels.DocumentDescriptionEmbedding
		if err := db.Where("document_description_id = ? AND model_id = ? AND embedding_dim = ?", input.DocumentDescriptionID, model.ID, clipEmbeddingDim).
			First(&saved).Error; err != nil {
			return nil, CreateDescriptionEmbeddingOutput{}, fmt.Errorf("failed to load saved embedding: %w", err)
		}

		out := CreateDescriptionEmbeddingOutput{EmbeddingID: saved.ID}
		outJSON, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
		}, out, nil
	})
}
