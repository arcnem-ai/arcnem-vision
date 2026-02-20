package clients

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Config struct {
	AccessKeyID     string
	AccessKeySecret string
	BucketName      string
	Endpoint        string
	Region          string
}

func LoadS3Config() S3Config {
	s3Config := S3Config{
		AccessKeyID:     os.Getenv("S3_ACCESS_KEY_ID"),
		AccessKeySecret: os.Getenv("S3_SECRET_ACCESS_KEY"),
		BucketName:      os.Getenv("S3_BUCKET"),
		Endpoint:        os.Getenv("S3_ENDPOINT"),
		Region:          os.Getenv("S3_REGION"),
	}

	if s3Config.AccessKeyID == "" || s3Config.AccessKeySecret == "" || s3Config.BucketName == "" || s3Config.Endpoint == "" || s3Config.Region == "" {
		log.Fatalf("incomplete S3 configuration")
	}

	return s3Config
}

type S3Client struct {
	s3Client *s3.Client
	config   S3Config
}

func NewS3Client(ctx context.Context) *S3Client {
	s3Config := LoadS3Config()

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			s3Config.AccessKeyID,
			s3Config.AccessKeySecret,
			"",
		)),
		config.WithRegion(s3Config.Region),
		config.WithBaseEndpoint(s3Config.Endpoint),
	)
	if err != nil {
		log.Fatalf("failed to load S3 config: %v", err)
	}

	s3Client := s3.NewFromConfig(cfg)

	return &S3Client{
		s3Client: s3Client,
		config:   s3Config,
	}
}

func (c *S3Client) Download(ctx context.Context, key string) ([]byte, error) {
	resp, err := c.s3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &c.config.BucketName,
		Key:    &key,
	})
	if err != nil {
		return nil, fmt.Errorf("GetObject %s: %w", key, err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", key, err)
	}
	return bodyBytes, nil
}

func (c *S3Client) PresignDownload(ctx context.Context, key string, expiresIn time.Duration) (string, error) {
	if expiresIn <= 0 {
		expiresIn = 15 * time.Minute
	}

	presignClient := s3.NewPresignClient(c.s3Client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &c.config.BucketName,
		Key:    &key,
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiresIn
	})
	if err != nil {
		return "", fmt.Errorf("PresignGetObject %s: %w", key, err)
	}

	return req.URL, nil
}
