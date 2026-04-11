package main

import (
	"log"

	"github.com/arcnem-ai/arcnem-vision/models/agents/server"
)

func main() {
	if err := server.StartServer(); err != nil {
		log.Fatal(err)
	}
}
