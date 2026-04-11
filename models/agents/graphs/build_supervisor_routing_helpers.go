package graphs

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/tmc/langchaingo/llms"
)

func parseSupervisorConfig(snapshotNode *SnapshotNode) (supervisorConfig, error) {
	var cfg supervisorConfig
	if err := json.Unmarshal([]byte(snapshotNode.Node.Config), &cfg); err != nil {
		return supervisorConfig{}, fmt.Errorf(
			"supervisor node %q: invalid config json: %w",
			snapshotNode.Node.NodeKey,
			err,
		)
	}
	if len(cfg.Members) == 0 {
		return supervisorConfig{}, fmt.Errorf(
			"supervisor node %q: config must specify \"members\"",
			snapshotNode.Node.NodeKey,
		)
	}
	cfg.FinishTarget = strings.TrimSpace(cfg.FinishTarget)
	if cfg.MaxIterations <= 0 {
		cfg.MaxIterations = defaultSupervisorMaxIterations
	}
	return cfg, nil
}

func supervisorTimeout(cfg supervisorConfig) time.Duration {
	if cfg.TimeoutSeconds > 0 {
		return time.Duration(cfg.TimeoutSeconds) * time.Second
	}
	return defaultSupervisorTimeout
}

func extractLastAIMessageFromSlice(messages []llms.MessageContent) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != llms.ChatMessageTypeAI {
			continue
		}
		for _, part := range messages[i].Parts {
			text, ok := part.(llms.TextContent)
			if !ok {
				continue
			}
			if strings.HasPrefix(text.Text, "[supervisor]") {
				continue
			}
			return text.Text
		}
	}
	return ""
}
