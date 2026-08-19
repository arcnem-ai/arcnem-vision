package clients

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/tmc/langchaingo/llms"
)

const (
	providerCallMaxAttempts = 3
	providerRetryDelay      = 100 * time.Millisecond
)

type executionIDContextKey struct{}

type retryingModel struct {
	model     llms.Model
	node      string
	provider  string
	modelName string
}

type providerCallError struct {
	status string
}

func (e *providerCallError) Error() string {
	return fmt.Sprintf("provider request failed (status=%s)", e.status)
}

// ContextWithExecutionID attaches the workflow run identity used by provider diagnostics.
func ContextWithExecutionID(ctx context.Context, executionID string) context.Context {
	return context.WithValue(ctx, executionIDContextKey{}, executionID)
}

// WithProviderRetry adds bounded transient retries and content-safe diagnostics to a model.
func WithProviderRetry(model llms.Model, node string, provider string, modelName string) llms.Model {
	return &retryingModel{
		model:     model,
		node:      node,
		provider:  provider,
		modelName: modelName,
	}
}

func (m *retryingModel) GenerateContent(
	ctx context.Context,
	messages []llms.MessageContent,
	options ...llms.CallOption,
) (*llms.ContentResponse, error) {
	requestBytes, requestHash := messageFingerprint(messages)
	return runProviderCall(ctx, m, requestBytes, requestHash, func() (*llms.ContentResponse, error) {
		return m.model.GenerateContent(ctx, messages, options...)
	})
}

func (m *retryingModel) Call(
	ctx context.Context,
	prompt string,
	options ...llms.CallOption,
) (string, error) {
	hash := sha256.Sum256([]byte(prompt))
	return runProviderCall(ctx, m, len(prompt), fmt.Sprintf("%x", hash), func() (string, error) {
		return m.model.Call(ctx, prompt, options...)
	})
}

func (m *retryingModel) SupportsReasoning() bool {
	reasoningModel, ok := m.model.(llms.ReasoningModel)
	return ok && reasoningModel.SupportsReasoning()
}

func runProviderCall[T any](
	ctx context.Context,
	model *retryingModel,
	requestBytes int,
	requestHash string,
	call func() (T, error),
) (T, error) {
	var zero T
	executionID, _ := ctx.Value(executionIDContextKey{}).(string)

	for attempt := 1; ; attempt++ {
		startedAt := time.Now()
		result, err := call()
		status, retryable := classifyProviderError(ctx, err)
		log.Printf(
			"provider request execution=%q node=%q provider=%q model=%q attempt=%d max_attempts=%d status=%q latency_ms=%d request_bytes=%d request_sha256=%s",
			diagnosticValue(executionID),
			diagnosticValue(model.node),
			diagnosticValue(model.provider),
			diagnosticValue(model.modelName),
			attempt,
			providerCallMaxAttempts,
			status,
			time.Since(startedAt).Milliseconds(),
			requestBytes,
			requestHash,
		)
		if err == nil {
			return result, nil
		}
		if !retryable || attempt == providerCallMaxAttempts {
			return zero, &providerCallError{status: status}
		}

		timer := time.NewTimer(time.Duration(attempt) * providerRetryDelay)
		select {
		case <-ctx.Done():
			timer.Stop()
			status, _ = classifyProviderError(ctx, ctx.Err())
			return zero, &providerCallError{status: status}
		case <-timer.C:
		}
	}
}

func classifyProviderError(ctx context.Context, err error) (string, bool) {
	if err == nil {
		return "ok", false
	}
	if ctx.Err() != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return "timeout", false
		}
		return "canceled", false
	}
	if status := providerHTTPStatus(err); status != 0 {
		return strconv.Itoa(status), isTransientProviderStatus(status)
	}

	var netErr net.Error
	if errors.As(err, &netErr) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return "transport_error", true
	}
	message := err.Error()
	if strings.HasPrefix(message, "network error: ") || strings.HasPrefix(message, "request timeout: ") {
		return "transport_error", true
	}

	return "error", false
}

func providerHTTPStatus(err error) int {
	const marker = "API returned unexpected status code: "
	message := err.Error()
	if !strings.HasPrefix(message, marker) {
		return 0
	}

	statusText := message[len(marker):]
	if len(statusText) < 3 || (len(statusText) > 3 && statusText[3] >= '0' && statusText[3] <= '9') {
		return 0
	}
	status, err := strconv.Atoi(statusText[:3])
	if err != nil || status < 100 || status > 599 {
		return 0
	}
	return status
}

func isTransientProviderStatus(status int) bool {
	switch status {
	case 500, 502, 503, 504:
		return true
	default:
		return false
	}
}

func messageFingerprint(messages []llms.MessageContent) (int, string) {
	payload, err := json.Marshal(messages)
	if err != nil {
		return 0, "unavailable"
	}
	hash := sha256.Sum256(payload)
	return len(payload), fmt.Sprintf("%x", hash)
}

func diagnosticValue(value string) string {
	if value == "" {
		return "unknown"
	}
	return value
}
