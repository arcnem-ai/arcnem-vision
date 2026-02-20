package client

import (
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewPGClient() *gorm.DB {
	pg := postgres.New(postgres.Config{
		DSN:                  os.Getenv("DATABASE_URL"),
		PreferSimpleProtocol: true,
	})

	pgClient, err := gorm.Open(pg, &gorm.Config{
		Logger: logger.New(
			log.New(os.Stdout, "", 0),
			logger.Config{
				SlowThreshold:             100 * time.Second,
				LogLevel:                  logger.Info,
				IgnoreRecordNotFoundError: true,
				Colorful:                  true,
			},
		),
	})

	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	return pgClient
}
