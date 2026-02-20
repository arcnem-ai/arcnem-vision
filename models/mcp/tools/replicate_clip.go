package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/replicate/replicate-go"
)

const clipRequestTimeout = 90 * time.Second
const clipPredictionURL = "https://api.replicate.com/v1/models/openai/clip/predictions"
const clipPreferWaitSeconds = "60"
const clipResponsePreviewLimit = 800

func runCLIPPrediction(ctx context.Context, input map[string]any) (map[string]any, error) {
	runCtx, cancel := context.WithTimeout(ctx, clipRequestTimeout)
	defer cancel()

	token := strings.TrimSpace(os.Getenv("REPLICATE_API_TOKEN"))
	if token == "" {
		return nil, fmt.Errorf("REPLICATE_API_TOKEN not set")
	}

	normalizedInput, err := normalizeCLIPInput(input)
	if err != nil {
		return nil, err
	}

	body, err := json.Marshal(map[string]any{
		"input": normalizedInput,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal replicate request: %w", err)
	}

	req, err := http.NewRequestWithContext(runCtx, http.MethodPost, clipPredictionURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to build replicate request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "wait="+clipPreferWaitSeconds)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("replicate request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read replicate response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("replicate request failed status=%d body=%s", resp.StatusCode, responsePreview(respBody))
	}

	var payload map[string]any
	if err := json.Unmarshal(respBody, &payload); err != nil {
		return nil, fmt.Errorf("replicate returned non-json success status=%d body=%s: %w", resp.StatusCode, responsePreview(respBody), err)
	}

	if errVal, hasErr := payload["error"]; hasErr && errVal != nil {
		return nil, fmt.Errorf("replicate prediction error: %v", errVal)
	}

	if status, _ := payload["status"].(string); status != "" && status != "succeeded" {
		return nil, fmt.Errorf("replicate prediction did not succeed status=%q", status)
	}

	outputRaw, ok := payload["output"]
	if !ok || outputRaw == nil {
		return nil, fmt.Errorf("replicate response missing output")
	}

	output, ok := outputRaw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("replicate output is not an object: %T", outputRaw)
	}

	return output, nil
}

func normalizeCLIPInput(input map[string]any) (map[string]any, error) {
	normalized := make(map[string]any, len(input))
	for key, value := range input {
		if file, ok := value.(*replicate.File); ok {
			if file == nil {
				return nil, fmt.Errorf("replicate input %q file is nil", key)
			}
			fileURL := strings.TrimSpace(file.URLs["get"])
			if fileURL == "" {
				return nil, fmt.Errorf("replicate input %q file has empty get url", key)
			}
			normalized[key] = fileURL
			continue
		}
		normalized[key] = value
	}
	return normalized, nil
}

func responsePreview(body []byte) string {
	text := string(bytes.ToValidUTF8(body, []byte{}))
	text = strings.TrimSpace(text)
	if text == "" {
		return "<empty>"
	}
	text = strings.Join(strings.Fields(text), " ")
	if len(text) > clipResponsePreviewLimit {
		return text[:clipResponsePreviewLimit] + "..."
	}
	return text
}
