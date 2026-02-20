package clients

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/replicate/replicate-go"
)

const replicateErrorPreviewLimit = 800

func NewReplicateClient() *replicate.Client {
	replicateAPIKey := os.Getenv("REPLICATE_API_TOKEN")
	if replicateAPIKey == "" {
		log.Fatalf("REPLICATE_API_TOKEN not set")
	}

	httpClient := &http.Client{
		Transport: &replicateDiagnosticTransport{base: http.DefaultTransport},
	}

	client, err := replicate.NewClient(
		replicate.WithToken(replicateAPIKey),
		replicate.WithHTTPClient(httpClient),
	)
	if err != nil {
		log.Fatalf("Failed to create replicate client %v", err)
	}

	return client
}

type replicateDiagnosticTransport struct {
	base http.RoundTripper
}

func (t *replicateDiagnosticTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	transport := t.base
	if transport == nil {
		transport = http.DefaultTransport
	}

	resp, err := transport.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.Body == nil {
		return resp, nil
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	shouldInspect := resp.StatusCode >= 400 || !strings.Contains(contentType, "application/json")
	if !shouldInspect {
		return resp, nil
	}

	body, readErr := io.ReadAll(resp.Body)
	if closeErr := resp.Body.Close(); readErr == nil {
		readErr = closeErr
	}
	if readErr != nil {
		log.Printf(
			"replicate response inspect failed method=%s path=%s status=%d err=%v",
			req.Method,
			req.URL.Path,
			resp.StatusCode,
			readErr,
		)
		resp.Body = io.NopCloser(bytes.NewReader(nil))
		resp.ContentLength = 0
		resp.Header.Set("Content-Length", "0")
		return resp, nil
	}

	resp.Body = io.NopCloser(bytes.NewReader(body))
	resp.ContentLength = int64(len(body))
	resp.Header.Set("Content-Length", strconv.Itoa(len(body)))

	preview := responsePreview(body)
	if resp.StatusCode >= 400 {
		log.Printf(
			"replicate error response method=%s path=%s status=%d content_type=%q body_preview=%q",
			req.Method,
			req.URL.Path,
			resp.StatusCode,
			contentType,
			preview,
		)

		if !looksLikeJSONBody(body) {
			wrappedBody, marshalErr := json.Marshal(map[string]any{
				"title":  "Non-JSON error response from Replicate",
				"status": resp.StatusCode,
				"detail": preview,
			})
			if marshalErr == nil {
				resp.Body = io.NopCloser(bytes.NewReader(wrappedBody))
				resp.ContentLength = int64(len(wrappedBody))
				resp.Header.Set("Content-Length", strconv.Itoa(len(wrappedBody)))
				resp.Header.Set("Content-Type", "application/json")
			}
		}
	} else if !strings.Contains(contentType, "application/json") {
		log.Printf(
			"replicate non-json success response method=%s path=%s status=%d content_type=%q body_preview=%q",
			req.Method,
			req.URL.Path,
			resp.StatusCode,
			contentType,
			preview,
		)
	}

	return resp, nil
}

func looksLikeJSONBody(body []byte) bool {
	trimmed := strings.TrimSpace(string(body))
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")
}

func responsePreview(body []byte) string {
	text := string(bytes.ToValidUTF8(body, []byte{}))
	text = strings.TrimSpace(text)
	if text == "" {
		return "<empty>"
	}
	text = strings.Join(strings.Fields(text), " ")
	if len(text) > replicateErrorPreviewLimit {
		return text[:replicateErrorPreviewLimit] + "..."
	}
	return text
}
