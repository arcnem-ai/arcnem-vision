package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/arcnem-ai/arcnem-vision/models/mcp/clients"
	"github.com/arcnem-ai/arcnem-vision/models/shared/imageutil"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/replicate/replicate-go"
)

const (
	ocrImageMaxBytes     = 8 * 1024 * 1024
	ocrImageMaxDimension = 2048
)

func RegisterCreateDocumentOCR(server *mcp.Server) error {
	replicateClient, err := clients.NewReplicateClient()
	if err != nil {
		return err
	}
	db, err := dbclient.NewPGClient()
	if err != nil {
		return err
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_document_ocr",
		Description: "Generate OCR text with a versioned model, normalize the result, and persist it for a document.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input CreateDocumentOCRInput) (*mcp.CallToolResult, CreateDocumentOCROutput, error) {
		model, err := findModelByIdentity(
			db,
			input.ModelProvider,
			input.ModelName,
			input.ModelVersion,
		)
		if err != nil {
			return nil, CreateDocumentOCROutput{}, err
		}
		if model.Type == nil || strings.ToLower(strings.TrimSpace(*model.Type)) != "ocr" {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf(
				"model %s/%s version=%q is not an ocr model",
				model.Provider,
				model.Name,
				model.Version,
			)
		}

		cfg, err := parseOCRModelConfig(model.Config)
		if err != nil {
			return nil, CreateDocumentOCROutput{}, err
		}

		var sourceDocument dbmodels.Document
		if err := db.Where("id = ?", input.DocumentID).First(&sourceDocument).Error; err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf("failed to load source document: %w", err)
		}

		preparedImage, err := imageutil.PrepareImageForService(ctx, input.TempURL, imageutil.PrepareOptions{
			MaxBytes:         ocrImageMaxBytes,
			MaxDimension:     ocrImageMaxDimension,
			MaxDownloadBytes: segmentationMaxDownloadBytes,
		})
		if err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf(
				"failed to optimize source image for ocr document_id=%s model=%s/%s version=%q: %w",
				input.DocumentID,
				model.Provider,
				model.Name,
				model.Version,
				err,
			)
		}

		replicateFile, err := replicateClient.CreateFileFromBytes(ctx, preparedImage.Data, &replicate.CreateFileOptions{
			Filename:    fmt.Sprintf("%s-ocr.jpg", input.DocumentID),
			ContentType: preparedImage.MIMEType,
		})
		if err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf(
				"failed to upload optimized document image for ocr document_id=%s model=%s/%s version=%q: %w",
				input.DocumentID,
				model.Provider,
				model.Name,
				model.Version,
				err,
			)
		}
		if replicateFile == nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf(
				"failed to upload optimized document image for ocr document_id=%s: empty file response",
				input.DocumentID,
			)
		}
		if replicateFile.ID != "" {
			defer func(fileID string) {
				cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				_ = replicateClient.DeleteFile(cleanupCtx, fileID)
			}(replicateFile.ID)
		}

		effectiveInput := cloneMap(cfg.InputDefaults)
		for key, value := range input.InputParams {
			effectiveInput[key] = value
		}
		effectiveInput[cfg.InputImageField] = replicateFile

		rawOutput, err := runReplicateVersionedPrediction(ctx, model.Name, model.Version, effectiveInput)
		if err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf(
				"replicate ocr failed for document_id=%s model=%s/%s version=%q: %w",
				input.DocumentID,
				model.Provider,
				model.Name,
				model.Version,
				err,
			)
		}

		normalized, err := normalizeOCRResult(rawOutput, cfg)
		if err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf("failed to normalize ocr result: %w", err)
		}

		persistedInput := cloneMap(effectiveInput)
		delete(persistedInput, cfg.InputImageField)

		inputJSON, err := marshalJSON(persistedInput)
		if err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf("failed to marshal ocr input: %w", err)
		}
		resultJSON, err := marshalJSON(normalized.RawResult)
		if err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf("failed to marshal ocr result: %w", err)
		}

		record := dbmodels.DocumentOcrResult{
			DocumentID: input.DocumentID,
			ModelID:    model.ID,
			Input:      inputJSON,
			Text:       normalized.Text,
			Result:     resultJSON,
		}
		if normalized.AvgConfidence != nil {
			value := int32(*normalized.AvgConfidence)
			record.AvgConfidence = &value
		}
		if err := db.Create(&record).Error; err != nil {
			return nil, CreateDocumentOCROutput{}, fmt.Errorf("failed to save document ocr result: %w", err)
		}

		out := CreateDocumentOCROutput{
			OCRResultID:   record.ID,
			Text:          normalized.Text,
			AvgConfidence: normalized.AvgConfidence,
			Result:        normalized.RawResult,
		}

		publishDashboardOCREvent(ctx, sourceDocument)

		outJSON, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
		}, out, nil
	})

	return nil
}
