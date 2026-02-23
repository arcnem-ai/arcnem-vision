package clients

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
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
	UsePathStyle    bool
}

func LoadS3Config() S3Config {
	usePathStyleRaw := strings.TrimSpace(os.Getenv("S3_USE_PATH_STYLE"))
	usePathStyle := false
	if usePathStyleRaw != "" {
		v, err := strconv.ParseBool(usePathStyleRaw)
		if err != nil {
			log.Fatalf("invalid S3_USE_PATH_STYLE value %q: %v", usePathStyleRaw, err)
		}
		usePathStyle = v
	}

	s3Config := S3Config{
		AccessKeyID:     os.Getenv("S3_ACCESS_KEY_ID"),
		AccessKeySecret: os.Getenv("S3_SECRET_ACCESS_KEY"),
		BucketName:      os.Getenv("S3_BUCKET"),
		Endpoint:        os.Getenv("S3_ENDPOINT"),
		Region:          os.Getenv("S3_REGION"),
		UsePathStyle:    usePathStyle,
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

	s3Client := s3.NewFromConfig(cfg, func(options *s3.Options) {
		options.UsePathStyle = s3Config.UsePathStyle
	})

	return &S3Client{
		s3Client: s3Client,
		config:   s3Config,
	}
}

func (c *S3Client) PresignDownload(ctx context.Context, bucket string, key string, expiresIn time.Duration) (string, error) {
	if expiresIn <= 0 {
		expiresIn = 15 * time.Minute
	}

	presignClient := s3.NewPresignClient(c.s3Client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &bucket,
		Key:    &key,
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiresIn
	})
	if err != nil {
		return "", fmt.Errorf("PresignGetObject bucket=%s key=%s: %w", bucket, key, err)
	}

	return req.URL, nil
}
