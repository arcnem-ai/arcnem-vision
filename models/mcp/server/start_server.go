package server

import (
	"log"
	"net/http"
	"os"

	"github.com/arcnem-ai/arcnem-vision/models/mcp/tools"
	"github.com/arcnem-ai/arcnem-vision/models/shared/env"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func init() {
	env.LoadEnv()
}

func StartServer() {
	server := mcp.NewServer(&mcp.Implementation{Name: os.Getenv("MCP_SERVER_NAME"), Version: os.Getenv("MCP_SERVER_VERSION")}, nil)

	tools.RegisterCreateDocumentDescription(server)
	tools.RegisterCreateDocumentEmbedding(server)
	tools.RegisterCreateDescriptionEmbedding(server)
	tools.RegisterFindSimilarDocuments(server)
	tools.RegisterFindSimilarDescriptions(server)

	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, nil)

	port := os.Getenv("PORT")
	if port == "" {
		port = "3021"
	}
	addr := ":" + port
	log.Printf("MCP streamable HTTP server listening on %s", addr)

	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
