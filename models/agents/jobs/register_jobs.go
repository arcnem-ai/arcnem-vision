package jobs

import (
	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/inngest/inngestgo"
	"gorm.io/gorm"
)

func RegisterJobs(inngestClient inngestgo.Client, dbClient *gorm.DB, s3Client *clients.S3Client, mcpClient *clients.MCPClient) {
	seedInitialWithContext := WithJobContext(dbClient, s3Client, mcpClient, ProcessDocumentUpload)
	inngestgo.CreateFunction(inngestClient, inngestgo.FunctionOpts{
		ID: "process-document-upload",
	},
		inngestgo.EventTrigger("document/process.upload", nil),
		seedInitialWithContext,
	)
}
