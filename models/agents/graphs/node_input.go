package graphs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"path"
	"strings"

	"github.com/arcnem-ai/arcnem-vision/models/shared/imageutil"
	"github.com/tmc/langchaingo/llms"
)

const (
	serviceImageMaxBytes         = 8 * 1024 * 1024
	serviceImageMaxDimension     = 2048
	serviceImageMaxDownloadBytes = 128 * 1024 * 1024
)

type nodeInputConfig struct {
	InputMode   string `json:"input_mode"`
	InputPrompt string `json:"input_prompt"`
}

func parseNodeInputConfig(configJSON string) (nodeInputConfig, error) {
	var cfg nodeInputConfig
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nodeInputConfig{}, err
	}
	return cfg, nil
}

func buildHumanInputMessage(ctx context.Context, input string, cfg nodeInputConfig, defaultPrompt string) (llms.MessageContent, error) {
	mode := strings.ToLower(strings.TrimSpace(cfg.InputMode))
	prompt := strings.TrimSpace(cfg.InputPrompt)
	if prompt == "" {
		prompt = defaultPrompt
	}

	if mode == "image_url" || (mode == "" && looksLikeImageURL(input)) {
		parts := make([]llms.ContentPart, 0, 2)
		if rawInput := strings.TrimSpace(input); rawInput != "" {
			prepared, err := imageutil.PrepareImageForService(ctx, rawInput, imageutil.PrepareOptions{
				MaxBytes:         serviceImageMaxBytes,
				MaxDimension:     serviceImageMaxDimension,
				MaxDownloadBytes: serviceImageMaxDownloadBytes,
			})
			if err != nil {
				return llms.MessageContent{}, fmt.Errorf("failed to optimize image input: %w", err)
			}
			dataURL := prepared.DataURL()
			if dataURL == "" {
				return llms.MessageContent{}, fmt.Errorf("optimized image data url is empty")
			}
			log.Printf(
				"graph image optimized original_bytes=%d final_bytes=%d original_size=%dx%d final_size=%dx%d reencoded=%t original_content_type=%q",
				prepared.OriginalBytes,
				prepared.FinalBytes,
				prepared.OriginalWidth,
				prepared.OriginalHeight,
				prepared.FinalWidth,
				prepared.FinalHeight,
				prepared.Reencoded,
				prepared.OriginalContentType,
			)
			parts = append(parts, llms.ImageURLPart(dataURL))
		}
		if prompt != "" {
			parts = append(parts, llms.TextPart(prompt))
		}
		if len(parts) == 0 {
			parts = append(parts, llms.TextPart(defaultPrompt))
		}
		return llms.MessageContent{
			Role:  llms.ChatMessageTypeHuman,
			Parts: parts,
		}, nil
	}

	parts := make([]llms.ContentPart, 0, 2)
	if prompt != "" {
		parts = append(parts, llms.TextPart(prompt))
	}
	if strings.TrimSpace(input) != "" {
		parts = append(parts, llms.TextPart(input))
	}
	if len(parts) == 0 {
		parts = append(parts, llms.TextPart(defaultPrompt))
	}
	return llms.MessageContent{
		Role:  llms.ChatMessageTypeHuman,
		Parts: parts,
	}, nil
}

func looksLikeImageURL(value string) bool {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}

	if strings.Contains(strings.ToLower(u.RawQuery), "x-amz-signature=") {
		return true
	}
	ext := strings.ToLower(path.Ext(u.Path))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".heic":
		return true
	default:
		return false
	}
}
