package imageutil

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPrepareImageBytes_UnderLimitPassThrough(t *testing.T) {
	src := encodeSolidJPEG(t, 320, 180, 85)

	prepared, err := PrepareImageBytes(src, "image/jpeg", PrepareOptions{
		MaxBytes: len(src) + 1024,
	})
	if err != nil {
		t.Fatalf("PrepareImageBytes returned error: %v", err)
	}

	if prepared.Reencoded {
		t.Fatalf("expected pass-through image to not be reencoded")
	}
	if prepared.FinalBytes != len(src) {
		t.Fatalf("expected final bytes=%d, got %d", len(src), prepared.FinalBytes)
	}
	if !bytes.Equal(prepared.Data, src) {
		t.Fatalf("expected output bytes to match input bytes")
	}
}

func TestPrepareImageBytes_OverLimitOptimizes(t *testing.T) {
	src := encodeNoisePNG(t, 1600, 1200)
	maxBytes := 250 * 1024
	if len(src) <= maxBytes {
		t.Fatalf("test setup invalid: source image is already <= max bytes (%d <= %d)", len(src), maxBytes)
	}

	prepared, err := PrepareImageBytes(src, "image/png", PrepareOptions{
		MaxBytes:     maxBytes,
		MaxDimension: 1024,
		MinDimension: 256,
	})
	if err != nil {
		t.Fatalf("PrepareImageBytes returned error: %v", err)
	}

	if !prepared.Reencoded {
		t.Fatalf("expected optimized image to be reencoded")
	}
	if prepared.MIMEType != "image/jpeg" {
		t.Fatalf("expected optimized mime type image/jpeg, got %q", prepared.MIMEType)
	}
	if prepared.FinalBytes > maxBytes {
		t.Fatalf("expected optimized bytes <= %d, got %d", maxBytes, prepared.FinalBytes)
	}
	requireDecodedOutput(t, prepared, 1024)
	// 1600x1200 scaled to fit 1024 keeps the 4:3 aspect ratio.
	if prepared.FinalWidth*3 != prepared.FinalHeight*4 {
		t.Fatalf("expected a 4:3 image, got %dx%d", prepared.FinalWidth, prepared.FinalHeight)
	}
}

func TestPrepareImageForService_DownloadsAndOptimizes(t *testing.T) {
	src := encodeNoisePNG(t, 1200, 900)
	maxBytes := 200 * 1024

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(src)
	}))
	defer server.Close()

	prepared, err := PrepareImageForService(context.Background(), server.URL, PrepareOptions{
		MaxBytes:     maxBytes,
		MaxDimension: 1024,
		MinDimension: 256,
	})
	if err != nil {
		t.Fatalf("PrepareImageForService returned error: %v", err)
	}
	if prepared.FinalBytes > maxBytes {
		t.Fatalf("expected optimized bytes <= %d, got %d", maxBytes, prepared.FinalBytes)
	}
	requireDecodedOutput(t, prepared, 1024)
}

// requireDecodedOutput decodes the prepared bytes and checks them against the
// reported metadata, so corrupt output with plausible numbers fails.
func requireDecodedOutput(t *testing.T, prepared *PreparedImage, maxDimension int) {
	t.Helper()
	if len(prepared.Data) != prepared.FinalBytes {
		t.Fatalf("reported %d bytes, data has %d", prepared.FinalBytes, len(prepared.Data))
	}
	decoded, format, err := image.Decode(bytes.NewReader(prepared.Data))
	if err != nil {
		t.Fatalf("prepared image does not decode: %v", err)
	}
	if "image/"+format != prepared.MIMEType {
		t.Fatalf("reported %q, data is %q", prepared.MIMEType, "image/"+format)
	}
	bounds := decoded.Bounds()
	if bounds.Dx() != prepared.FinalWidth || bounds.Dy() != prepared.FinalHeight {
		t.Fatalf("reported %dx%d, data is %dx%d", prepared.FinalWidth, prepared.FinalHeight, bounds.Dx(), bounds.Dy())
	}
	if bounds.Dx() > maxDimension || bounds.Dy() > maxDimension {
		t.Fatalf("expected dimensions <= %d, got %dx%d", maxDimension, bounds.Dx(), bounds.Dy())
	}
	if bounds.Dx() < 1 || bounds.Dy() < 1 {
		t.Fatalf("decoded image is empty")
	}
}

func encodeSolidJPEG(t *testing.T, width int, height int, quality int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	fill := color.RGBA{R: 90, G: 140, B: 220, A: 255}
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, fill)
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
		t.Fatalf("failed to encode jpeg: %v", err)
	}
	return buf.Bytes()
}

func encodeNoisePNG(t *testing.T, width int, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	rng := rand.New(rand.NewSource(42))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{
				R: uint8(rng.Intn(256)),
				G: uint8(rng.Intn(256)),
				B: uint8(rng.Intn(256)),
				A: 255,
			})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode png: %v", err)
	}
	return buf.Bytes()
}
