package clients

import (
	"fmt"
	"os"

	"github.com/inngest/inngestgo"
)

func NewInngestClient() (inngestgo.Client, error) {
	clientOpts := inngestgo.ClientOpts{
		AppID: os.Getenv("INNGEST_APP_ID"),
	}

	client, err := inngestgo.NewClient(clientOpts)
	if err != nil {
		return nil, fmt.Errorf(
			"failed to initialize inngest client: %w",
			err,
		)
	}

	return client, nil
}
