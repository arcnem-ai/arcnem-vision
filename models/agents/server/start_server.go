package server

import (
	"context"
	"fmt"
	"net/http"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/arcnem-ai/arcnem-vision/models/agents/jobs"
	"github.com/arcnem-ai/arcnem-vision/models/db/client"
	"github.com/arcnem-ai/arcnem-vision/models/shared/env"
	"github.com/gin-gonic/gin"
)

func StartServer() error {
	if err := env.LoadEnv(); err != nil {
		return fmt.Errorf("load env: %w", err)
	}

	router := gin.Default()

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	ctx := context.Background()

	inngestClient, err := clients.NewInngestClient()
	if err != nil {
		return err
	}
	dbClient, err := client.NewPGClient()
	if err != nil {
		return err
	}
	s3Client, err := clients.NewS3Client(ctx)
	if err != nil {
		return err
	}
	mcpClient, err := clients.NewMCPClient()
	if err != nil {
		return err
	}

	jobs.RegisterJobs(inngestClient, dbClient, s3Client, mcpClient)

	inngestHandler, err := clients.NewInngestHandler(inngestClient)
	if err != nil {
		return err
	}
	publicInngestHandler := gin.WrapH(clients.RequireSignedInngestSync(inngestHandler))
	router.POST(clients.InngestServePath, publicInngestHandler)
	router.GET(clients.InngestServePath, publicInngestHandler)
	router.PUT(clients.InngestServePath, publicInngestHandler)
	go clients.SyncInngestFunctions(ctx, inngestHandler)

	return router.Run()
}
