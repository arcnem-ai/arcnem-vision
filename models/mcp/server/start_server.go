package server

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/arcnem-ai/arcnem-vision/models/mcp/tools"
	"github.com/arcnem-ai/arcnem-vision/models/shared/env"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type toolRegistrar func(*mcp.Server) error

func registerTools(server *mcp.Server) error {
	if err := tools.ValidateDocumentSearchConfig(); err != nil {
		return err
	}

	registrars := []toolRegistrar{
		tools.RegisterCreateDocumentDescription,
		tools.RegisterCreateDocumentEmbedding,
		tools.RegisterCreateDocumentOCR,
		tools.RegisterCreateDocumentSegmentation,
		tools.RegisterCreateDescriptionEmbedding,
		tools.RegisterFindSimilarDocuments,
		tools.RegisterFindSimilarDescriptions,
		tools.RegisterSearchDocumentsInScope,
		tools.RegisterBrowseDocumentsInScope,
		tools.RegisterReadDocumentContext,
	}

	for _, register := range registrars {
		if err := register(server); err != nil {
			return err
		}
	}

	return nil
}

func newStreamableHTTPHandler(server *mcp.Server) http.Handler {
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, &mcp.StreamableHTTPOptions{Stateless: true})
}

func StartServer() error {
	if err := env.LoadEnv(); err != nil {
		return fmt.Errorf("load env: %w", err)
	}

	serverName := os.Getenv("MCP_SERVER_NAME")
	if serverName == "" {
		return fmt.Errorf("MCP_SERVER_NAME not set")
	}
	serverVersion := os.Getenv("MCP_SERVER_VERSION")
	if serverVersion == "" {
		return fmt.Errorf("MCP_SERVER_VERSION not set")
	}

	server := mcp.NewServer(&mcp.Implementation{Name: serverName, Version: serverVersion}, nil)
	if err := registerTools(server); err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("/", newStreamableHTTPHandler(server))

	port := os.Getenv("PORT")
	if port == "" {
		port = "3021"
	}
	addr := ":" + port
	log.Printf("MCP streamable HTTP server listening on %s", addr)

	return http.ListenAndServe(addr, mux)
}
