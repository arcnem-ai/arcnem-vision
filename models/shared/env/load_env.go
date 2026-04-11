package env

import (
	"os"

	"github.com/joho/godotenv"
)

func LoadEnv() error {
	environment := os.Getenv("ENVIRONMENT")
	if environment == "" {
		if err := godotenv.Load(); err != nil {
			return err
		}
	}

	return nil
}
