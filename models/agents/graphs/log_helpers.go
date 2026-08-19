package graphs

import "strings"

func isMaxIterationsMessage(s string) bool {
	return strings.Contains(strings.ToLower(s), "maximum iterations reached")
}
