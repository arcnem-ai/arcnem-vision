package client

import "testing"

func TestNewPGClientRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	db, err := NewPGClient()
	if err == nil {
		t.Fatal("expected missing DATABASE_URL to return an error")
	}
	if db != nil {
		t.Fatal("expected db client to be nil when DATABASE_URL is missing")
	}
}
