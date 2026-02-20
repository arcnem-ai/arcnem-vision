package clients

import (
	"log"
	"os"

	"github.com/inngest/inngestgo"
)

func NewInngestClient() inngestgo.Client {
	clientOpts := inngestgo.ClientOpts{
		AppID: os.Getenv("INNGEST_APP_ID"),
	}

	client, err := inngestgo.NewClient(clientOpts)
	if err != nil {
		log.Fatalf("failed to initialize inngest client: %v", err)
	}

	return client
}
