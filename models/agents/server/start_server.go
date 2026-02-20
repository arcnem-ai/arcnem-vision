package server

import (
	"context"
	"net/http"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/arcnem-ai/arcnem-vision/models/agents/jobs"
	"github.com/arcnem-ai/arcnem-vision/models/db/client"
	"github.com/arcnem-ai/arcnem-vision/models/shared/env"
	"github.com/gin-gonic/gin"
)

func init() {
	env.LoadEnv()
}

func StartServer() {
	router := gin.Default()

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	ctx := context.Background()

	inngestClient := clients.NewInngestClient()
	dbClient := client.NewPGClient()
	s3Client := clients.NewS3Client(ctx)
	mcpClient, err := clients.NewMCPClient()
	if err != nil {
		panic(err)
	}

	jobs.RegisterJobs(inngestClient, dbClient, s3Client, mcpClient)

	router.POST("/api/inngest", gin.WrapH(inngestClient.Serve()))
	router.GET("/api/inngest", gin.WrapH(inngestClient.Serve()))
	router.PUT("/api/inngest", gin.WrapH(inngestClient.Serve()))

	router.Run()
}
