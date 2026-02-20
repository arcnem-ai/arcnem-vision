package env

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

func LoadEnv() {
	environment := os.Getenv("ENVIRONMENT")
	if environment == "" {
		if err := godotenv.Load(); err != nil {
			log.Fatalf("No .env file found or error loading .env file | env %s", environment)
		}
	}
}
