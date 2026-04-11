package s3

import "testing"

func TestLoadS3ConfigRejectsInvalidPathStyle(t *testing.T) {
	t.Setenv("S3_USE_PATH_STYLE", "definitely-not-bool")
	t.Setenv("S3_ACCESS_KEY_ID", "key")
	t.Setenv("S3_SECRET_ACCESS_KEY", "secret")
	t.Setenv("S3_BUCKET", "bucket")
	t.Setenv("S3_ENDPOINT", "https://example.com")
	t.Setenv("S3_REGION", "auto")

	if _, err := LoadS3Config(); err == nil {
		t.Fatal("expected invalid S3_USE_PATH_STYLE to return an error")
	}
}

func TestLoadS3ConfigRequiresAllFields(t *testing.T) {
	t.Setenv("S3_USE_PATH_STYLE", "")
	t.Setenv("S3_ACCESS_KEY_ID", "")
	t.Setenv("S3_SECRET_ACCESS_KEY", "secret")
	t.Setenv("S3_BUCKET", "bucket")
	t.Setenv("S3_ENDPOINT", "https://example.com")
	t.Setenv("S3_REGION", "auto")

	if _, err := LoadS3Config(); err == nil {
		t.Fatal("expected incomplete S3 configuration to return an error")
	}
}
