package tools

import "testing"

func TestResolveDocumentSearchMode(t *testing.T) {
	t.Run("defaults to hybrid when unset", func(t *testing.T) {
		mode, err := resolveDocumentSearchMode("")
		if err != nil {
			t.Fatalf("resolveDocumentSearchMode returned error: %v", err)
		}
		if mode != documentSearchModeHybrid {
			t.Fatalf("expected hybrid mode, got %q", mode)
		}
	})

	t.Run("accepts lexical", func(t *testing.T) {
		mode, err := resolveDocumentSearchMode("lexical")
		if err != nil {
			t.Fatalf("resolveDocumentSearchMode returned error: %v", err)
		}
		if mode != documentSearchModeLexical {
			t.Fatalf("expected lexical mode, got %q", mode)
		}
	})

	t.Run("rejects invalid values", func(t *testing.T) {
		if _, err := resolveDocumentSearchMode("semantic-only"); err == nil {
			t.Fatal("expected invalid mode to return an error")
		}
	})
}
