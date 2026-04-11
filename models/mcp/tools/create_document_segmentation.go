package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	dbclient "github.com/arcnem-ai/arcnem-vision/models/db/client"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/arcnem-ai/arcnem-vision/models/mcp/clients"
	"github.com/arcnem-ai/arcnem-vision/models/shared/imageutil"
	shareds3 "github.com/arcnem-ai/arcnem-vision/models/shared/s3"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/replicate/replicate-go"
)

const (
	segmentationImageMaxBytes     = 8 * 1024 * 1024
	segmentationImageMaxDimension = 2048
)

func RegisterCreateDocumentSegmentation(server *mcp.Server) error {
	replicateClient, err := clients.NewReplicateClient()
	if err != nil {
		return err
	}
	db, err := dbclient.NewPGClient()
	if err != nil {
		return err
	}
	s3Client, err := shareds3.NewS3Client(context.Background())
	if err != nil {
		return err
	}

	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_document_segmentation",
		Description: "Generate a document segmentation with a versioned model and persist both the result payload and any derived segmented image.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input CreateDocumentSegmentationInput) (*mcp.CallToolResult, CreateDocumentSegmentationOutput, error) {
		startedAt := time.Now()

		model, err := findModelByIdentity(
			db,
			input.ModelProvider,
			input.ModelName,
			input.ModelVersion,
		)
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, err
		}
		if model.Type == nil || strings.ToLower(strings.TrimSpace(*model.Type)) != "segmentation" {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf(
				"model %s/%s version=%q is not a segmentation model",
				model.Provider,
				model.Name,
				model.Version,
			)
		}

		cfg, err := parseSegmentationModelConfig(model.Config)
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, err
		}

		var sourceDocument dbmodels.Document
		if err := db.Where("id = ?", input.DocumentID).First(&sourceDocument).Error; err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to load source document: %w", err)
		}

		prepareStartedAt := time.Now()
		preparedImage, err := imageutil.PrepareImageForService(ctx, input.TempURL, imageutil.PrepareOptions{
			MaxBytes:         segmentationImageMaxBytes,
			MaxDimension:     segmentationImageMaxDimension,
			MaxDownloadBytes: segmentationMaxDownloadBytes,
		})
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf(
				"failed to optimize source image for segmentation document_id=%s model=%s/%s version=%q prepare_duration_ms=%d total_duration_ms=%d: %w",
				input.DocumentID,
				model.Provider,
				model.Name,
				model.Version,
				time.Since(prepareStartedAt).Milliseconds(),
				time.Since(startedAt).Milliseconds(),
				err,
			)
		}

		replicateFile, err := replicateClient.CreateFileFromBytes(ctx, preparedImage.Data, &replicate.CreateFileOptions{
			Filename:    fmt.Sprintf("%s-segmentation.jpg", input.DocumentID),
			ContentType: preparedImage.MIMEType,
		})
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf(
				"failed to upload optimized document image for segmentation document_id=%s model=%s/%s version=%q: %w",
				input.DocumentID,
				model.Provider,
				model.Name,
				model.Version,
				err,
			)
		}
		if replicateFile == nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf(
				"failed to upload optimized document image for segmentation document_id=%s: empty file response",
				input.DocumentID,
			)
		}
		if replicateFile.ID != "" {
			defer func(fileID string) {
				cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				if err := replicateClient.DeleteFile(cleanupCtx, fileID); err != nil {
					log.Printf("replicate segmentation cleanup failed document_id=%s file_id=%s err=%v", input.DocumentID, fileID, err)
				}
			}(replicateFile.ID)
		}

		effectiveInput := cloneMap(cfg.InputDefaults)
		for key, value := range input.InputParams {
			effectiveInput[key] = value
		}
		effectiveInput[cfg.InputImageField] = replicateFile

		runStartedAt := time.Now()
		rawOutput, err := runReplicateVersionedPrediction(ctx, model.Name, model.Version, effectiveInput)
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf(
				"replicate segmentation failed for document_id=%s model=%s/%s version=%q run_duration_ms=%d total_duration_ms=%d: %w",
				input.DocumentID,
				model.Provider,
				model.Name,
				model.Version,
				time.Since(runStartedAt).Milliseconds(),
				time.Since(startedAt).Milliseconds(),
				err,
			)
		}

		persistedResult, err := resolveSegmentationResult(ctx, rawOutput, cfg)
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to resolve segmentation result: %w", err)
		}

		persistedInput := cloneMap(effectiveInput)
		delete(persistedInput, cfg.InputImageField)

		var segmentedDocumentID string
		var segmentedTempURL string
		if strings.TrimSpace(cfg.OutputImagePath) != "" {
			outputImageURL, err := extractStringByPath(rawOutput, cfg.OutputImagePath)
			if err != nil {
				return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to resolve segmentation output image: %w", err)
			}
			if outputImageURL != "" {
				imageBytes, contentType, err := downloadURL(ctx, outputImageURL, segmentationMaxDownloadBytes)
				if err != nil {
					return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to download segmented image: %w", err)
				}
				derivedContentType := normalizeDerivedImageContentType(contentType, imageBytes)
				objectKey := buildSegmentedObjectKey(
					sourceDocument.ID,
					model.Provider,
					model.Name,
					model.Version,
					derivedContentType,
				)
				uploaded, err := s3Client.UploadBytes(ctx, sourceDocument.Bucket, objectKey, imageBytes, derivedContentType)
				if err != nil {
					return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to upload segmented image: %w", err)
				}

				etag := uploaded.ETag
				if strings.TrimSpace(etag) == "" {
					etag = fmt.Sprintf("segmentation-%s", sourceDocument.ID)
				}

				derivedDocument := dbmodels.Document{
					Bucket:         uploaded.Bucket,
					ObjectKey:      uploaded.Key,
					ContentType:    uploaded.ContentType,
					Etag:           etag,
					SizeBytes:      uploaded.SizeBytes,
					LastModifiedAt: uploaded.LastModifiedAt,
					Visibility:     sourceDocument.Visibility,
					OrganizationID: sourceDocument.OrganizationID,
					ProjectID:      sourceDocument.ProjectID,
					DeviceID:       sourceDocument.DeviceID,
				}
				if err := db.Create(&derivedDocument).Error; err != nil {
					return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to create segmented document: %w", err)
				}

				segmentedDocumentID = derivedDocument.ID
				segmentedTempURL, err = s3Client.PresignDownload(ctx, derivedDocument.Bucket, derivedDocument.ObjectKey, 15*time.Minute)
				if err != nil {
					return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to presign segmented document: %w", err)
				}
			}
		}

		inputJSON, err := marshalJSON(persistedInput)
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to marshal segmentation input: %w", err)
		}
		resultJSON, err := marshalJSON(persistedResult)
		if err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to marshal segmentation result: %w", err)
		}

		record := dbmodels.DocumentSegmentation{
			SourceDocumentID: input.DocumentID,
			ModelID:          model.ID,
			Input:            inputJSON,
			Result:           resultJSON,
		}
		if segmentedDocumentID != "" {
			record.SegmentedDocumentID = &segmentedDocumentID
		}
		if err := db.Create(&record).Error; err != nil {
			return nil, CreateDocumentSegmentationOutput{}, fmt.Errorf("failed to save document segmentation: %w", err)
		}

		out := CreateDocumentSegmentationOutput{
			SegmentationID: record.ID,
			Result:         persistedResult,
		}
		if segmentedDocumentID != "" {
			out.SegmentedDocumentID = segmentedDocumentID
			out.SegmentedTempURL = segmentedTempURL
		}

		publishDashboardSegmentationEvent(ctx, sourceDocument, segmentedDocumentID)

		outJSON, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(outJSON)}},
		}, out, nil
	})

	return nil
}
