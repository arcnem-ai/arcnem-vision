package clients

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"time"

	"github.com/inngest/inngestgo"
)

// InngestServePath is where the agents serve their Inngest functions.
const InngestServePath = "/api/inngest"

func NewInngestClient() (inngestgo.Client, error) {
	// The Go SDK enters dev mode for any non-empty INNGEST_DEV, so a value
	// meant to turn it off would silently turn it on.
	switch strings.ToLower(os.Getenv("INNGEST_DEV")) {
	case "0", "false":
		return nil, fmt.Errorf("INNGEST_DEV must be unset outside local development, not %q", os.Getenv("INNGEST_DEV"))
	}

	clientOpts := inngestgo.ClientOpts{
		AppID: os.Getenv("INNGEST_APP_ID"),
	}

	client, err := inngestgo.NewClient(clientOpts)
	if err != nil {
		return nil, fmt.Errorf(
			"failed to initialize inngest client: %w",
			err,
		)
	}

	return client, nil
}

// NewInngestHandler serves the client's functions. INNGEST_SERVE_ORIGIN is the
// agents' own origin, where Inngest calls back.
//
// The handler accepts unsigned sync requests because SyncInngestFunctions sends
// one. Mount it behind RequireSignedInngestSync, not directly.
func NewInngestHandler(client inngestgo.Client) (http.Handler, error) {
	origin := os.Getenv("INNGEST_SERVE_ORIGIN")
	if origin == "" {
		return nil, fmt.Errorf("INNGEST_SERVE_ORIGIN not set")
	}
	path := InngestServePath
	enableUnauthedSync := true
	return client.ServeWithOpts(inngestgo.ServeOpts{
		Origin:             &origin,
		Path:               &path,
		EnableUnauthedSync: &enableUnauthedSync,
	}), nil
}

// RequireSignedInngestSync rejects unsigned sync requests from outside the
// process, so only Inngest itself and SyncInngestFunctions can make the agents
// re-register. The local dev server does not sign its requests, so dev mode
// lets them through, as the SDK itself would.
func RequireSignedInngestSync(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut && r.Header.Get("X-Inngest-Signature") == "" && os.Getenv("INNGEST_DEV") == "" {
			http.Error(w, `{"message":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}
		handler.ServeHTTP(w, r)
	})
}

// SyncInngestFunctions registers the agents' functions with the Inngest
// server, retrying until the server accepts them or ctx ends.
//
// A self-hosted Inngest server syncs an app by sending it a signed PUT and
// waiting for the app to post its functions to /fn/register. The Go SDK
// answers a signed PUT with the functions in the response body instead, which
// the self-hosted server ignores, so the agents would never register. An
// unsigned PUT makes the SDK post them, so the agents send one to themselves.
func SyncInngestFunctions(ctx context.Context, handler http.Handler) {
	delay := time.Second
	for {
		request := httptest.NewRequestWithContext(ctx, http.MethodPut, InngestServePath, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code == http.StatusOK {
			log.Printf("Registered functions with Inngest")
			return
		}

		log.Printf("Could not register functions with Inngest (status %d), retrying in %s", response.Code, delay)
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		delay = min(delay*2, 30*time.Second)
	}
}
