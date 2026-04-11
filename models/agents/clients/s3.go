package clients

import (
	"context"
	shareds3 "github.com/arcnem-ai/arcnem-vision/models/shared/s3"
)

type S3Config = shareds3.S3Config
type S3Client = shareds3.S3Client

func NewS3Client(ctx context.Context) (*S3Client, error) {
	return shareds3.NewS3Client(ctx)
}
