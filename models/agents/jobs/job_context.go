package jobs

import (
	"context"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/inngest/inngestgo"
	"gorm.io/gorm"
)

type JobContextKey string

const (
	dbKey  JobContextKey = "db"
	s3Key  JobContextKey = "s3"
	mcpKey JobContextKey = "mcp"
)

func WithDBClient(ctx context.Context, dbClient *gorm.DB) context.Context {
	return context.WithValue(ctx, dbKey, dbClient)
}

func GetDBClient(ctx context.Context) (*gorm.DB, bool) {
	dbClient, ok := ctx.Value(dbKey).(*gorm.DB)
	return dbClient, ok
}

func WithS3Client(ctx context.Context, s3Client *clients.S3Client) context.Context {
	return context.WithValue(ctx, s3Key, s3Client)
}

func GetS3Client(ctx context.Context) (*clients.S3Client, bool) {
	s3Client, ok := ctx.Value(s3Key).(*clients.S3Client)
	return s3Client, ok
}

func GetMCPClient(ctx context.Context) (*clients.MCPClient, bool) {
	mcpClient, ok := ctx.Value(mcpKey).(*clients.MCPClient)
	return mcpClient, ok
}

func WithMCPClient(ctx context.Context, mcpClient *clients.MCPClient) context.Context {
	return context.WithValue(ctx, mcpKey, mcpClient)
}

func WithJobContext[T any](dbClient *gorm.DB, s3Client *clients.S3Client, mcpClient *clients.MCPClient, fn func(ctx context.Context, input inngestgo.Input[T]) (any, error),
) func(ctx context.Context, input inngestgo.Input[T]) (any, error) {
	return func(ctx context.Context, input inngestgo.Input[T]) (any, error) {
		ctxWithDB := WithDBClient(ctx, dbClient)
		ctxWithS3 := WithS3Client(ctxWithDB, s3Client)
		ctxWithMCP := WithMCPClient(ctxWithS3, mcpClient)

		return fn(ctxWithMCP, input)
	}
}
