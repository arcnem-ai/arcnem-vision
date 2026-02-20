package clients

import (
	"fmt"
	"os"

	"github.com/tmc/langchaingo/llms/openai"
)

func NewOpenAIClient(modelName string) (*openai.LLM, error) {
	openaiAPIKey := os.Getenv("OPENAI_API_KEY")
	if openaiAPIKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY not set")
	}

	return openai.New(openai.WithModel(modelName))
}
