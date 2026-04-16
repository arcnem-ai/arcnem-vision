package tools

import (
	"time"
)

type documentSearchRow struct {
	DocumentID      string    `gorm:"column:document_id"`
	ObjectKey       string    `gorm:"column:object_key"`
	ContentType     string    `gorm:"column:content_type"`
	SizeBytes       int64     `gorm:"column:size_bytes"`
	ProjectID       string    `gorm:"column:project_id"`
	ProjectName     string    `gorm:"column:project_name"`
	APIKeyID        *string   `gorm:"column:api_key_id"`
	APIKeyName      *string   `gorm:"column:api_key_name"`
	DescriptionText string    `gorm:"column:description_text"`
	OCRText         string    `gorm:"column:ocr_text"`
	Score           float64   `gorm:"column:score"`
	CreatedAt       time.Time `gorm:"column:created_at"`
}

type documentContextRow struct {
	DocumentID      string     `gorm:"column:document_id"`
	ObjectKey       string     `gorm:"column:object_key"`
	ProjectID       string     `gorm:"column:project_id"`
	ProjectName     string     `gorm:"column:project_name"`
	APIKeyID        *string    `gorm:"column:api_key_id"`
	APIKeyName      *string    `gorm:"column:api_key_name"`
	DescriptionText string     `gorm:"column:description_text"`
	OCRText         string     `gorm:"column:ocr_text"`
	OCRCreatedAt    *time.Time `gorm:"column:ocr_created_at"`
	OCRModelLabel   *string    `gorm:"column:ocr_model_label"`
	CreatedAt       time.Time  `gorm:"column:created_at"`
}

type segmentationContextRow struct {
	SourceDocumentID string    `gorm:"column:source_document_id"`
	SegmentationID   string    `gorm:"column:segmentation_id"`
	Prompt           *string   `gorm:"column:prompt"`
	CreatedAt        time.Time `gorm:"column:created_at"`
	ModelLabel       string    `gorm:"column:model_label"`
	DescriptionText  string    `gorm:"column:description_text"`
	OCRText          string    `gorm:"column:ocr_text"`
	ObjectKey        *string   `gorm:"column:object_key"`
}
