package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/replicate/replicate-go"
)

const (
	replicatePredictionRequestTimeout = 3 * time.Minute
	replicatePreferWaitSeconds        = "60"
	replicatePredictionPollInterval   = 1500 * time.Millisecond
)

func runReplicateVersionedPrediction(ctx context.Context, modelName string, version string, input map[string]any) (any, error) {
	runCtx, cancel := context.WithTimeout(ctx, replicatePredictionRequestTimeout)
	defer cancel()

	token := strings.TrimSpace(os.Getenv("REPLICATE_API_TOKEN"))
	if token == "" {
		return nil, fmt.Errorf("REPLICATE_API_TOKEN not set")
	}

	modelOwner, modelSlug, err := splitReplicateModelName(modelName)
	if err != nil {
		return nil, err
	}

	normalizedInput, err := normalizeReplicateInput(input)
	if err != nil {
		return nil, err
	}

	body, err := json.Marshal(map[string]any{
		"input": normalizedInput,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal replicate request: %w", err)
	}

	predictionURL := fmt.Sprintf(
		"https://api.replicate.com/v1/models/%s/%s/versions/%s/predictions",
		url.PathEscape(modelOwner),
		url.PathEscape(modelSlug),
		url.PathEscape(strings.TrimSpace(version)),
	)
	payload, err := doReplicateJSONRequest(
		runCtx,
		token,
		http.MethodPost,
		predictionURL,
		body,
		replicatePreferWaitSeconds,
	)
	if err != nil {
		return nil, err
	}
	payload, err = waitForReplicatePrediction(runCtx, token, payload)
	if err != nil {
		return nil, err
	}

	outputRaw, ok := payload["output"]
	if !ok {
		return nil, fmt.Errorf("replicate response missing output")
	}

	return outputRaw, nil
}

func waitForReplicatePrediction(ctx context.Context, token string, payload map[string]any) (map[string]any, error) {
	for {
		if errVal, hasErr := payload["error"]; hasErr && errVal != nil {
			return nil, fmt.Errorf("replicate prediction error: %s", asString(errVal))
		}

		status := strings.TrimSpace(asString(payload["status"]))
		switch status {
		case "", "succeeded":
			return payload, nil
		case "starting", "processing", "queued":
			pollURL := replicatePredictionPollURL(payload)
			if pollURL == "" {
				return nil, fmt.Errorf("replicate prediction status=%q but response is missing a poll url", status)
			}

			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("replicate prediction polling timed out while status=%q: %w", status, ctx.Err())
			case <-time.After(replicatePredictionPollInterval):
			}

			nextPayload, err := doReplicateJSONRequest(ctx, token, http.MethodGet, pollURL, nil, "")
			if err != nil {
				return nil, err
			}
			payload = nextPayload
		case "failed", "canceled", "cancelled":
			if errVal, hasErr := payload["error"]; hasErr && errVal != nil {
				return nil, fmt.Errorf(
					"replicate prediction %s: %s",
					status,
					asString(errVal),
				)
			}
			return nil, fmt.Errorf("replicate prediction did not succeed status=%q", status)
		default:
			return nil, fmt.Errorf("replicate prediction did not succeed status=%q", status)
		}
	}
}

func doReplicateJSONRequest(
	ctx context.Context,
	token string,
	method string,
	requestURL string,
	body []byte,
	preferWaitSeconds string,
) (map[string]any, error) {
	var requestBody io.Reader
	if len(body) > 0 {
		requestBody = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, requestURL, requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to build replicate request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	if preferWaitSeconds != "" {
		req.Header.Set("Prefer", "wait="+preferWaitSeconds)
	}

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

	return payload, nil
}

func replicatePredictionPollURL(payload map[string]any) string {
	if urls, ok := payload["urls"].(map[string]any); ok {
		if getURL := strings.TrimSpace(asString(urls["get"])); getURL != "" {
			return getURL
		}
	}

	predictionID := strings.TrimSpace(asString(payload["id"]))
	if predictionID == "" {
		return ""
	}

	return "https://api.replicate.com/v1/predictions/" + url.PathEscape(predictionID)
}

func asString(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func normalizeReplicateInput(input map[string]any) (map[string]any, error) {
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

func splitReplicateModelName(modelName string) (string, string, error) {
	parts := strings.Split(strings.TrimSpace(modelName), "/")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid replicate model name %q", modelName)
	}
	if strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return "", "", fmt.Errorf("invalid replicate model name %q", modelName)
	}
	return parts[0], parts[1], nil
}
