package imageutil

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	_ "image/gif"
	_ "image/png"
)

const (
	defaultMaxBytes         = 8 * 1024 * 1024
	defaultMaxDimension     = 2048
	defaultMaxDownloadBytes = 128 * 1024 * 1024
	defaultMinDimension     = 256
	defaultScaleStep        = 0.85
	maxScalePasses          = 8
)

var defaultJPEGQualities = []int{85, 75, 65, 55, 45, 35}

type PrepareOptions struct {
	MaxBytes         int
	MaxDimension     int
	MaxDownloadBytes int
	MinDimension     int
	ScaleStep        float64
	JPEGQualities    []int
	HTTPClient       *http.Client
}

type PreparedImage struct {
	Data                []byte
	MIMEType            string
	OriginalBytes       int
	FinalBytes          int
	OriginalWidth       int
	OriginalHeight      int
	FinalWidth          int
	FinalHeight         int
	OriginalContentType string
	Reencoded           bool
}

func (p *PreparedImage) DataURL() string {
	if p == nil || len(p.Data) == 0 {
		return ""
	}
	mimeType := strings.TrimSpace(p.MIMEType)
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(p.Data)
}

func PrepareImageForService(ctx context.Context, imageURL string, options PrepareOptions) (*PreparedImage, error) {
	opts := withDefaults(options)
	rawURL := strings.TrimSpace(imageURL)
	if rawURL == "" {
		return nil, fmt.Errorf("image url is empty")
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("invalid image url: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("unsupported image url scheme %q", parsed.Scheme)
	}

	body, contentType, err := downloadImage(ctx, rawURL, opts)
	if err != nil {
		return nil, err
	}

	return PrepareImageBytes(body, contentType, opts)
}

func PrepareImageBytes(data []byte, contentType string, options PrepareOptions) (*PreparedImage, error) {
	opts := withDefaults(options)
	if len(data) == 0 {
		return nil, fmt.Errorf("image data is empty")
	}

	detectedContentType := http.DetectContentType(data)
	mimeType := normalizeImageMIME(contentType, detectedContentType)
	originalWidth, originalHeight := decodeDimensions(data)

	if len(data) <= opts.MaxBytes {
		return &PreparedImage{
			Data:                cloneBytes(data),
			MIMEType:            mimeType,
			OriginalBytes:       len(data),
			FinalBytes:          len(data),
			OriginalWidth:       originalWidth,
			OriginalHeight:      originalHeight,
			FinalWidth:          originalWidth,
			FinalHeight:         originalHeight,
			OriginalContentType: mimeType,
			Reencoded:           false,
		}, nil
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf(
			"image exceeds max_bytes=%d (got %d bytes) and decode failed: %w",
			opts.MaxBytes,
			len(data),
			err,
		)
	}

	bounds := img.Bounds()
	srcW, srcH := bounds.Dx(), bounds.Dy()
	if srcW == 0 || srcH == 0 {
		return nil, fmt.Errorf("image has invalid dimensions %dx%d", srcW, srcH)
	}

	targetW, targetH := scaleToMaxDimension(srcW, srcH, opts.MaxDimension)
	bestSize := 0
	bestW, bestH := targetW, targetH
	bestQuality := 0

	currentW, currentH := targetW, targetH
	for pass := 0; pass < maxScalePasses; pass++ {
		resized := resizeNearest(img, currentW, currentH)
		for _, quality := range opts.JPEGQualities {
			encoded, err := encodeJPEG(resized, quality)
			if err != nil {
				return nil, fmt.Errorf("jpeg encode failed at quality=%d: %w", quality, err)
			}
			if bestSize == 0 || len(encoded) < bestSize {
				bestSize = len(encoded)
				bestW = currentW
				bestH = currentH
				bestQuality = quality
			}
			if len(encoded) <= opts.MaxBytes {
				return &PreparedImage{
					Data:                encoded,
					MIMEType:            "image/jpeg",
					OriginalBytes:       len(data),
					FinalBytes:          len(encoded),
					OriginalWidth:       srcW,
					OriginalHeight:      srcH,
					FinalWidth:          currentW,
					FinalHeight:         currentH,
					OriginalContentType: mimeType,
					Reencoded:           true,
				}, nil
			}
		}

		if currentW <= opts.MinDimension || currentH <= opts.MinDimension {
			break
		}

		nextW := int(float64(currentW) * opts.ScaleStep)
		nextH := int(float64(currentH) * opts.ScaleStep)
		if nextW < opts.MinDimension {
			nextW = opts.MinDimension
		}
		if nextH < opts.MinDimension {
			nextH = opts.MinDimension
		}
		if nextW == currentW && nextH == currentH {
			break
		}
		currentW, currentH = nextW, nextH
	}

	return nil, fmt.Errorf(
		"unable to optimize image below max_bytes=%d (smallest=%d, quality=%d, size=%dx%d, original_bytes=%d, original_size=%dx%d)",
		opts.MaxBytes,
		bestSize,
		bestQuality,
		bestW,
		bestH,
		len(data),
		srcW,
		srcH,
	)
}

func withDefaults(options PrepareOptions) PrepareOptions {
	opts := options
	if opts.MaxBytes <= 0 {
		opts.MaxBytes = defaultMaxBytes
	}
	if opts.MaxDimension <= 0 {
		opts.MaxDimension = defaultMaxDimension
	}
	if opts.MaxDownloadBytes <= 0 {
		opts.MaxDownloadBytes = defaultMaxDownloadBytes
	}
	if opts.MinDimension <= 0 {
		opts.MinDimension = defaultMinDimension
	}
	if opts.ScaleStep <= 0 || opts.ScaleStep >= 1 {
		opts.ScaleStep = defaultScaleStep
	}
	if len(opts.JPEGQualities) == 0 {
		opts.JPEGQualities = defaultJPEGQualities
	}
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
	return opts
}

func downloadImage(ctx context.Context, imageURL string, options PrepareOptions) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create image download request: %w", err)
	}
	req.Header.Set("Accept", "image/*")

	resp, err := options.HTTPClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("failed to download image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, "", fmt.Errorf("failed to download image: status=%d", resp.StatusCode)
	}

	reader := io.LimitReader(resp.Body, int64(options.MaxDownloadBytes)+1)
	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read downloaded image: %w", err)
	}
	if len(body) > options.MaxDownloadBytes {
		return nil, "", fmt.Errorf("downloaded image exceeded max download bytes (%d)", options.MaxDownloadBytes)
	}

	return body, resp.Header.Get("Content-Type"), nil
}

func normalizeImageMIME(contentType string, detected string) string {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if strings.HasPrefix(ct, "image/") {
		return ct
	}
	d := strings.ToLower(strings.TrimSpace(strings.Split(detected, ";")[0]))
	if strings.HasPrefix(d, "image/") {
		return d
	}
	return "application/octet-stream"
}

func decodeDimensions(data []byte) (int, int) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}

func encodeJPEG(img image.Image, quality int) ([]byte, error) {
	if quality < 1 {
		quality = 1
	}
	if quality > 100 {
		quality = 100
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return cloneBytes(buf.Bytes()), nil
}

func scaleToMaxDimension(width int, height int, maxDimension int) (int, int) {
	if maxDimension <= 0 || (width <= maxDimension && height <= maxDimension) {
		return width, height
	}
	if width >= height {
		scaledH := int(float64(height) * float64(maxDimension) / float64(width))
		if scaledH < 1 {
			scaledH = 1
		}
		return maxDimension, scaledH
	}
	scaledW := int(float64(width) * float64(maxDimension) / float64(height))
	if scaledW < 1 {
		scaledW = 1
	}
	return scaledW, maxDimension
}

func resizeNearest(src image.Image, width int, height int) image.Image {
	if width <= 0 {
		width = 1
	}
	if height <= 0 {
		height = 1
	}

	srcBounds := src.Bounds()
	srcW := srcBounds.Dx()
	srcH := srcBounds.Dy()
	if srcW == 0 || srcH == 0 {
		return image.NewRGBA(image.Rect(0, 0, width, height))
	}

	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		srcY := srcBounds.Min.Y + (y*srcH)/height
		if srcY >= srcBounds.Max.Y {
			srcY = srcBounds.Max.Y - 1
		}
		for x := 0; x < width; x++ {
			srcX := srcBounds.Min.X + (x*srcW)/width
			if srcX >= srcBounds.Max.X {
				srcX = srcBounds.Max.X - 1
			}
			dst.Set(x, y, src.At(srcX, srcY))
		}
	}
	return dst
}

func cloneBytes(data []byte) []byte {
	if len(data) == 0 {
		return nil
	}
	out := make([]byte, len(data))
	copy(out, data)
	return out
}
