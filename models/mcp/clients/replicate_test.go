package clients

import "testing"

func TestNewReplicateClientRequiresToken(t *testing.T) {
	t.Setenv("REPLICATE_API_TOKEN", "")

	client, err := NewReplicateClient()
	if err == nil {
		t.Fatal("expected missing REPLICATE_API_TOKEN to return an error")
	}
	if client != nil {
		t.Fatal("expected client to be nil when REPLICATE_API_TOKEN is missing")
	}
}
