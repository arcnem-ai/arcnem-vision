package clients

import (
	"fmt"

	"github.com/arcnem-ai/arcnem-vision/models/agents/enums"
)

func NewModelClient(provider string, modelName string) (any, error) {
	switch provider {
	case enums.ModelProviderOpenAI:
		return NewOpenAIClient(modelName)
	default:
		return nil, fmt.Errorf("Provider %s not yet implemented", provider)
	}
}
