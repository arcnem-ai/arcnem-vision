package clients

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/inngest/inngestgo"
)

func TestSyncInngestFunctionsRegistersOutOfBand(t *testing.T) {
	var attempts atomic.Int32
	registered := make(chan map[string]any, 1)
	inngestServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/fn/register" {
			http.NotFound(w, r)
			return
		}
		// The first attempt fails, as when the agents start before Inngest.
		if attempts.Add(1) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"starting"}`))
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode register request: %v", err)
		}
		registered <- body
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer inngestServer.Close()

	t.Setenv("INNGEST_DEV", "")
	t.Setenv("INNGEST_BASE_URL", inngestServer.URL)
	t.Setenv("INNGEST_SIGNING_KEY", "signkey-prod-0123456789abcdef0123456789abcdef")
	t.Setenv("INNGEST_EVENT_KEY", "test")
	t.Setenv("INNGEST_APP_ID", "arcnem-vision-agents")
	t.Setenv("INNGEST_SERVE_ORIGIN", "http://agents.internal:3020")

	client, err := NewInngestClient()
	if err != nil {
		t.Fatal(err)
	}
	_, err = inngestgo.CreateFunction(client, inngestgo.FunctionOpts{ID: "noop"},
		inngestgo.EventTrigger("test/noop", nil),
		func(ctx context.Context, input inngestgo.Input[map[string]any]) (any, error) {
			return nil, nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewInngestHandler(client)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	done := make(chan struct{})
	go func() {
		SyncInngestFunctions(ctx, handler)
		close(done)
	}()

	select {
	case body := <-registered:
		if got, want := body["url"], "http://agents.internal:3020/api/inngest"; got != want {
			t.Errorf("registered url = %v, want %v", got, want)
		}
		if functions, _ := body["functions"].([]any); len(functions) != 1 {
			t.Errorf("registered %d functions, want 1", len(functions))
		}
	case <-ctx.Done():
		t.Fatal("functions were never registered")
	}
	<-done
}

func TestNewInngestHandlerRequiresServeOrigin(t *testing.T) {
	t.Setenv("INNGEST_DEV", "1")
	t.Setenv("INNGEST_APP_ID", "arcnem-vision-agents")
	t.Setenv("INNGEST_SERVE_ORIGIN", "")
	client, err := NewInngestClient()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewInngestHandler(client); err == nil {
		t.Fatal("expected an error without INNGEST_SERVE_ORIGIN")
	}
}

func TestNewInngestClientRejectsDisabledDevMode(t *testing.T) {
	t.Setenv("INNGEST_APP_ID", "arcnem-vision-agents")
	for _, value := range []string{"0", "false"} {
		t.Setenv("INNGEST_DEV", value)
		if _, err := NewInngestClient(); err == nil {
			t.Errorf("INNGEST_DEV=%s: expected an error", value)
		}
	}
}

func TestRequireSignedInngestSync(t *testing.T) {
	reached := false
	handler := RequireSignedInngestSync(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
	}))
	serve := func(method string, signed bool) (int, bool) {
		reached = false
		request := httptest.NewRequest(method, InngestServePath, nil)
		if signed {
			request.Header.Set("X-Inngest-Signature", "t=1&s=abc")
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response.Code, reached
	}

	t.Setenv("INNGEST_DEV", "")
	if code, ok := serve(http.MethodPut, false); ok || code != http.StatusUnauthorized {
		t.Errorf("unsigned PUT: status %d, reached %v; want 401 and not reached", code, ok)
	}
	if _, ok := serve(http.MethodPut, true); !ok {
		t.Error("signed PUT did not reach the handler")
	}
	if _, ok := serve(http.MethodGet, false); !ok {
		t.Error("GET did not reach the handler")
	}

	t.Setenv("INNGEST_DEV", "1")
	if _, ok := serve(http.MethodPut, false); !ok {
		t.Error("unsigned PUT in dev mode did not reach the handler")
	}
}
