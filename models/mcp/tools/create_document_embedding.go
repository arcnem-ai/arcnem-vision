package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/arcnem-ai/arcnem-vision/models/mcp/clients"
	"github.com/arcnem-ai/arcnem-vision/models/shared/imageutil"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/replicate/replicate-go"
	"gorm.io/gorm/clause"
)

const clipEmbeddingDim = 768
const clipImageMaxBytes = 8 * 1024 * 1024
const clipImageMaxDimension = 2048
const clipImageMaxDownloadBytes = 128 * 1024 * 1024

func RegisterCreateDocumentEmbedding(server *mcp.Server) {
	replicateClient := clients.NewReplicateClient()
	db := dbclient.NewPGClient()

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_document_embedding",
		Description: "Generate a CLIP embedding for a document image and save it to the database.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input CreateDocumentEmbeddingInput) (*mcp.CallToolResult, CreateDocumentEmbeddingOutput, error) {
		startedAt := time.Now()

		var model dbmodels.Model
		if err := db.Where("provider = ? AND name = ?", "REPLICATE", "openai/clip").First(&model).Error; err != nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf("failed to find CLIP model in db: %w", err)
		}

		prepareStartedAt := time.Now()
		preparedImage, err := imageutil.PrepareImageForService(ctx, input.TempURL, imageutil.PrepareOptions{
			MaxBytes:         clipImageMaxBytes,
			MaxDimension:     clipImageMaxDimension,
			MaxDownloadBytes: clipImageMaxDownloadBytes,
		})
		prepareDuration := time.Since(prepareStartedAt)
		if err != nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf(
				"failed to optimize document image for CLIP document_id=%s temp_url_len=%d prepare_duration_ms=%d total_duration_ms=%d: %w",
				input.DocumentID,
				len(input.TempURL),
				prepareDuration.Milliseconds(),
				time.Since(startedAt).Milliseconds(),
				err,
			)
		}
		log.Printf(
			"replicate clip image optimized document_id=%s original_bytes=%d final_bytes=%d original_size=%dx%d final_size=%dx%d reencoded=%t original_content_type=%q prepare_duration_ms=%d",
			input.DocumentID,
			preparedImage.OriginalBytes,
			preparedImage.FinalBytes,
			preparedImage.OriginalWidth,
			preparedImage.OriginalHeight,
			preparedImage.FinalWidth,
			preparedImage.FinalHeight,
			preparedImage.Reencoded,
			preparedImage.OriginalContentType,
			prepareDuration.Milliseconds(),
		)

		uploadStartedAt := time.Now()
		replicateFile, err := replicateClient.CreateFileFromBytes(ctx, preparedImage.Data, &replicate.CreateFileOptions{
			Filename:    fmt.Sprintf("%s.jpg", input.DocumentID),
			ContentType: preparedImage.MIMEType,
		})
		uploadDuration := time.Since(uploadStartedAt)
		if err != nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf(
				"failed to upload optimized document image for CLIP document_id=%s final_bytes=%d upload_duration_ms=%d total_duration_ms=%d: %w",
				input.DocumentID,
				preparedImage.FinalBytes,
				uploadDuration.Milliseconds(),
				time.Since(startedAt).Milliseconds(),
				err,
			)
		}
		if replicateFile == nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf(
				"failed to upload optimized document image for CLIP document_id=%s: empty file response",
				input.DocumentID,
			)
		}
		log.Printf(
			"replicate clip image upload document_id=%s file_id=%s upload_duration_ms=%d",
			input.DocumentID,
			replicateFile.ID,
			uploadDuration.Milliseconds(),
		)
		if replicateFile.ID != "" {
			defer func(fileID string) {
				cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				if err := replicateClient.DeleteFile(cleanupCtx, fileID); err != nil {
					log.Printf("replicate clip image cleanup failed document_id=%s file_id=%s err=%v", input.DocumentID, fileID, err)
				}
			}(replicateFile.ID)
		}

		runStartedAt := time.Now()
		output, err := runCLIPPrediction(ctx, map[string]any{
			"image": replicateFile,
		})
		runDuration := time.Since(runStartedAt)
		if err != nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf(
				"replicate CLIP failed for document_id=%s temp_url_len=%d optimized_bytes=%d run_duration_ms=%d total_duration_ms=%d: %w",
				input.DocumentID,
				len(input.TempURL),
				preparedImage.FinalBytes,
				runDuration.Milliseconds(),
				time.Since(startedAt).Milliseconds(),
				err,
			)
		}
		log.Printf(
			"replicate clip image success document_id=%s run_duration_ms=%d total_duration_ms=%d",
			input.DocumentID,
			runDuration.Milliseconds(),
			time.Since(startedAt).Milliseconds(),
		)

		embedding, err := parseEmbedding(output)
		if err != nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf("failed to parse embedding: %w", err)
		}

		record := dbmodels.DocumentEmbedding{
			DocumentID:   input.DocumentID,
			ModelID:      model.ID,
			EmbeddingDim: clipEmbeddingDim,
			Embedding:    embedding,
		}
		if err := db.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "document_id"},
				{Name: "model_id"},
				{Name: "embedding_dim"},
			},
			DoUpdates: clause.AssignmentColumns([]string{"embedding", "updated_at"}),
		}).Create(&record).Error; err != nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf("failed to save embedding: %w", err)
		}

		var saved dbmodels.DocumentEmbedding
		if err := db.Where("document_id = ? AND model_id = ? AND embedding_dim = ?", input.DocumentID, model.ID, clipEmbeddingDim).
			First(&saved).Error; err != nil {
			return nil, CreateDocumentEmbeddingOutput{}, fmt.Errorf("failed to load saved embedding: %w", err)
		}

		out := CreateDocumentEmbeddingOutput{EmbeddingID: saved.ID}
		outJSON, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
		}, out, nil
	})
}
