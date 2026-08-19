package clients

import (
	"bytes"
	"context"
	"errors"
	"log"
	"strings"
	"testing"

	"github.com/tmc/langchaingo/llms"
)

type providerTestModel struct {
	generate func() (*llms.ContentResponse, error)
}

func (m *providerTestModel) GenerateContent(
	context.Context,
	[]llms.MessageContent,
	...llms.CallOption,
) (*llms.ContentResponse, error) {
	return m.generate()
}

func (m *providerTestModel) Call(context.Context, string, ...llms.CallOption) (string, error) {
	return "", errors.New("unexpected Call")
}

func TestProviderRetryHandles500ThenSuccessWithSafeDiagnostics(t *testing.T) {
	var logs bytes.Buffer
	previousOutput := log.Writer()
	previousFlags := log.Flags()
	previousPrefix := log.Prefix()
	log.SetOutput(&logs)
	log.SetFlags(0)
	log.SetPrefix("")
	t.Cleanup(func() {
		log.SetOutput(previousOutput)
		log.SetFlags(previousFlags)
		log.SetPrefix(previousPrefix)
	})

	calls := 0
	model := WithProviderRetry(&providerTestModel{generate: func() (*llms.ContentResponse, error) {
		calls++
		if calls == 1 {
			return nil, errors.New("API returned unexpected status code: 500: signed_url=https://secret.invalid/image?key=api-secret")
		}
		return &llms.ContentResponse{Choices: []*llms.ContentChoice{{Content: "ok"}}}, nil
	}}, "inspect_image", "OPENAI", "gpt-test")

	response, err := model.GenerateContent(
		ContextWithExecutionID(context.Background(), "execution-123"),
		[]llms.MessageContent{{
			Role: llms.ChatMessageTypeHuman,
			Parts: []llms.ContentPart{
				llms.TextPart("private prompt"),
				llms.ImageURLPart("https://secret.invalid/image?key=api-secret"),
			},
		}},
	)
	if err != nil {
		t.Fatalf("GenerateContent returned error: %v", err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 provider calls, got %d", calls)
	}
	if got := response.Choices[0].Content; got != "ok" {
		t.Fatalf("expected successful response, got %q", got)
	}

	output := logs.String()
	for _, expected := range []string{
		`execution="execution-123"`,
		`node="inspect_image"`,
		`provider="OPENAI"`,
		`model="gpt-test"`,
		`attempt=1 max_attempts=3 status="500"`,
		`attempt=2 max_attempts=3 status="ok"`,
		"latency_ms=",
		"request_bytes=",
		"request_sha256=",
	} {
		if !strings.Contains(output, expected) {
			t.Errorf("expected diagnostics to contain %q, got %q", expected, output)
		}
	}
	for _, secret := range []string{"private prompt", "secret.invalid", "api-secret"} {
		if strings.Contains(output, secret) {
			t.Errorf("diagnostics leaked %q: %q", secret, output)
		}
	}
}

func TestProviderRetryReturnsSafeErrorAfterExhaustion(t *testing.T) {
	calls := 0
	providerErr := errors.New("API returned unexpected status code: 503: prompt=private-prompt")
	model := WithProviderRetry(&providerTestModel{generate: func() (*llms.ContentResponse, error) {
		calls++
		return nil, providerErr
	}}, "worker", "OPENAI", "gpt-test")

	_, err := model.GenerateContent(context.Background(), nil)
	if err == nil {
		t.Fatal("expected exhausted provider call to fail")
	}
	if calls != providerCallMaxAttempts {
		t.Fatalf("expected %d provider calls, got %d", providerCallMaxAttempts, calls)
	}
	if got := err.Error(); got != "provider request failed (status=503)" {
		t.Fatalf("expected safe status error, got %q", got)
	}
}

func TestProviderRetryDoesNotRetryNonRetryableFailures(t *testing.T) {
	for _, test := range []struct {
		name string
		err  error
	}{
		{name: "authentication", err: errors.New("API returned unexpected status code: 401: api-key=private")},
		{name: "validation", err: errors.New("API returned unexpected status code: 400: prompt=private")},
		{name: "unclassified", err: errors.New("invalid request containing private input")},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			model := WithProviderRetry(&providerTestModel{generate: func() (*llms.ContentResponse, error) {
				calls++
				return nil, test.err
			}}, "worker", "OPENAI", "gpt-test")

			_, err := model.GenerateContent(context.Background(), nil)
			if err == nil {
				t.Fatal("expected provider call to fail")
			}
			if calls != 1 {
				t.Fatalf("expected one provider call, got %d", calls)
			}
			if strings.Contains(err.Error(), "private") {
				t.Fatalf("provider error leaked request content: %v", err)
			}
		})
	}
}

func TestProviderRetryClassifiesTransportFailureAsRetryable(t *testing.T) {
	status, retryable := classifyProviderError(
		context.Background(),
		errors.New("network error: failed to reach API server"),
	)
	if status != "transport_error" || !retryable {
		t.Fatalf("expected retryable transport_error, got status=%q retryable=%t", status, retryable)
	}
}
