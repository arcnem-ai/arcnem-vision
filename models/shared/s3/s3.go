package s3

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	awss3 "github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Config struct {
	AccessKeyID     string
	AccessKeySecret string
	BucketName      string
	Endpoint        string
	Region          string
	UsePathStyle    bool
}

type UploadedObject struct {
	Bucket         string
	Key            string
	ETag           string
	ContentType    string
	SizeBytes      int64
	LastModifiedAt time.Time
}

type S3Client struct {
	s3Client *awss3.Client
	config   S3Config
}

func LoadS3Config() (S3Config, error) {
	usePathStyleRaw := strings.TrimSpace(os.Getenv("S3_USE_PATH_STYLE"))
	usePathStyle := false
	if usePathStyleRaw != "" {
		v, err := strconv.ParseBool(usePathStyleRaw)
		if err != nil {
			return S3Config{}, fmt.Errorf(
				"invalid S3_USE_PATH_STYLE value %q: %w",
				usePathStyleRaw,
				err,
			)
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
		return S3Config{}, fmt.Errorf("incomplete S3 configuration")
	}

	return s3Config, nil
}

func NewS3Client(ctx context.Context) (*S3Client, error) {
	s3Config, err := LoadS3Config()
	if err != nil {
		return nil, err
	}

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
		return nil, fmt.Errorf("failed to load S3 config: %w", err)
	}

	client := awss3.NewFromConfig(cfg, func(options *awss3.Options) {
		options.UsePathStyle = s3Config.UsePathStyle
	})

	return &S3Client{
		s3Client: client,
		config:   s3Config,
	}, nil
}

func (c *S3Client) BucketName() string {
	return c.config.BucketName
}

func (c *S3Client) PresignDownload(ctx context.Context, bucket string, key string, expiresIn time.Duration) (string, error) {
	resolvedBucket := strings.TrimSpace(bucket)
	if resolvedBucket == "" {
		resolvedBucket = c.config.BucketName
	}
	if expiresIn <= 0 {
		expiresIn = 15 * time.Minute
	}

	presignClient := awss3.NewPresignClient(c.s3Client)
	req, err := presignClient.PresignGetObject(ctx, &awss3.GetObjectInput{
		Bucket: &resolvedBucket,
		Key:    &key,
	}, func(opts *awss3.PresignOptions) {
		opts.Expires = expiresIn
	})
	if err != nil {
		return "", fmt.Errorf("PresignGetObject bucket=%s key=%s: %w", resolvedBucket, key, err)
	}

	return req.URL, nil
}

func (c *S3Client) UploadBytes(ctx context.Context, bucket string, key string, data []byte, contentType string) (*UploadedObject, error) {
	resolvedBucket := strings.TrimSpace(bucket)
	if resolvedBucket == "" {
		resolvedBucket = c.config.BucketName
	}
	resolvedContentType := strings.TrimSpace(contentType)
	if resolvedContentType == "" {
		resolvedContentType = "application/octet-stream"
	}

	result, err := c.s3Client.PutObject(ctx, &awss3.PutObjectInput{
		Bucket:      &resolvedBucket,
		Key:         &key,
		Body:        bytes.NewReader(data),
		ContentType: &resolvedContentType,
	})
	if err != nil {
		return nil, fmt.Errorf("PutObject bucket=%s key=%s: %w", resolvedBucket, key, err)
	}

	etag := ""
	if result.ETag != nil {
		etag = strings.Trim(*result.ETag, "\"")
	}

	return &UploadedObject{
		Bucket:         resolvedBucket,
		Key:            key,
		ETag:           etag,
		ContentType:    resolvedContentType,
		SizeBytes:      int64(len(data)),
		LastModifiedAt: time.Now().UTC(),
	}, nil
}
